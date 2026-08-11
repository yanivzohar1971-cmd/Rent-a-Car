import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
  const webRoot = path.resolve(__dirname, "..");
  const blogPostsPath = path.join(webRoot, "src", "assets", "blogPosts.he.json");
  const seoLandingPagesPath = path.join(webRoot, "src", "assets", "seoLandingPages.he.json");
  const publicDir = path.join(webRoot, "public");
  const sitemapPath = path.join(publicDir, "sitemap.xml");
  const seoDir = path.join(publicDir, "seo");
  const seoSitemapPath = path.join(seoDir, "sitemap.xml");

const BASE_URL = "https://www.carexperts4u.com";

// Static pages with their priorities and changefreq
const staticPages = [
  { path: "/", priority: "1.0", changefreq: "daily" },
  { path: "/cars", priority: "0.9", changefreq: "hourly" },
  { path: "/sell", priority: "0.6", changefreq: "weekly" },
  { path: "/blog", priority: "0.7", changefreq: "weekly" },
  { path: "/legal/terms", priority: "0.2", changefreq: "yearly" },
  { path: "/legal/content-policy", priority: "0.2", changefreq: "yearly" },
];

try {
  // Read blog posts
  if (!fs.existsSync(blogPostsPath)) {
    console.error(`[generate-sitemap] Error: Blog posts file not found at ${blogPostsPath}`);
    process.exit(1);
  }

  const blogPostsContent = fs.readFileSync(blogPostsPath, "utf8");
  const blogPosts = JSON.parse(blogPostsContent);

  // Read SEO landing pages
  let seoLandingPages = [];
  if (fs.existsSync(seoLandingPagesPath)) {
    const seoLandingPagesContent = fs.readFileSync(seoLandingPagesPath, "utf8");
    seoLandingPages = JSON.parse(seoLandingPagesContent);
  } else {
    console.warn(`[generate-sitemap] Warning: SEO landing pages file not found at ${seoLandingPagesPath}`);
  }

  // Collect unique tags
  const uniqueTags = new Set();
  blogPosts.forEach((post) => {
    if (post.tags && Array.isArray(post.tags)) {
      post.tags.forEach((tag) => uniqueTags.add(tag));
    }
  });

  // Generate XML
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

  // Add static pages
  staticPages.forEach((page) => {
    xml += `  <url>
    <loc>${BASE_URL}${page.path}</loc>
    <priority>${page.priority}</priority>
    <changefreq>${page.changefreq}</changefreq>
  </url>
`;
  });

  // Add blog posts
  blogPosts.forEach((post) => {
    if (!post.slug) return;

    const lastmod = post.publishedAt
      ? new Date(post.publishedAt).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    xml += `  <url>
    <loc>${BASE_URL}/blog/${post.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
`;
  });

  // Add tag pages
  const today = new Date().toISOString().split("T")[0];
  uniqueTags.forEach((tag) => {
    const encodedTag = encodeURIComponent(tag);
    xml += `  <url>
    <loc>${BASE_URL}/blog/tag/${encodedTag}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
`;
  });

  // Add SEO landing pages
  seoLandingPages.forEach((page) => {
    if (!page.path) return;
    xml += `  <url>
    <loc>${BASE_URL}${page.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
`;
  });

  // Add /topics page
  xml += `  <url>
    <loc>${BASE_URL}/topics</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
`;

  xml += `</urlset>`;

  // Ensure public directory exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Ensure seo directory exists for backward compatibility
  if (!fs.existsSync(seoDir)) {
    fs.mkdirSync(seoDir, { recursive: true });
  }

  // Write sitemap to root
  fs.writeFileSync(sitemapPath, xml, "utf8");

  // Write sitemap to /seo/ for backward compatibility
  fs.writeFileSync(seoSitemapPath, xml, "utf8");

  const urlCount =
    staticPages.length + blogPosts.length + uniqueTags.size + seoLandingPages.length + 1; // +1 for /topics
  console.log(
    `[generate-sitemap] Generated sitemap.xml with ${urlCount} URLs (${staticPages.length} static, ${blogPosts.length} blog posts, ${uniqueTags.size} tags, ${seoLandingPages.length} SEO pages, 1 topics index)`
  );
  console.log(
    `[generate-sitemap] Also created /seo/sitemap.xml for backward compatibility`
  );
} catch (error) {
  console.error(`[generate-sitemap] Error generating sitemap:`, error.message);
  process.exit(1);
}
