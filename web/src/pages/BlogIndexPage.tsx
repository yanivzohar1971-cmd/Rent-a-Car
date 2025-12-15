import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import blogPostsData from '../assets/blogPosts.he.json';
import './BlogIndexPage.css';

interface BlogPost {
  slug: string;
  titleHe: string;
  metaDescriptionHe: string;
  excerptHe: string;
  publishedAt: string;
  tags: string[];
  cta: {
    primaryLabelHe: string;
    primaryHref: string;
    secondaryLabelHe: string;
    secondaryHref: string;
  };
}

export default function BlogIndexPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const posts = blogPostsData as BlogPost[];

  // Get all unique tags from posts
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    posts.forEach((post) => {
      post.tags?.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [posts]);

  // Client-side search and tag filter
  const filteredPosts = useMemo(() => {
    let filtered = posts;

    // Filter by selected tag
    if (selectedTag) {
      filtered = filtered.filter((post) => post.tags?.includes(selectedTag));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((post) => {
        const titleMatch = post.titleHe.toLowerCase().includes(query);
        const tagMatch = post.tags?.some((tag) => tag.toLowerCase().includes(query));
        return titleMatch || tagMatch;
      });
    }

    return filtered;
  }, [posts, searchQuery, selectedTag]);

  // Set page title
  useEffect(() => {
    document.title = 'בלוג רכב | CarExpert';
    
    // Set meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', 'טיפים קצרים לרכב, אביזרים, תחזוקה וקנייה חכמה — מאמרים קצרים לקריאה מהירה.');
  }, []);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('he-IL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="blog-index-page" dir="rtl">
      <div className="blog-index-container">
        <h1 className="blog-index-title">בלוג רכב — טיפים קצרים שעובדים</h1>

        {/* Categories chips */}
        {allTags.length > 0 && (
          <div className="blog-categories-section">
            <div className="blog-categories-chips">
              <button
                className={`blog-category-chip ${selectedTag === null ? 'active' : ''}`}
                onClick={() => setSelectedTag(null)}
              >
                הכל
              </button>
              {allTags.map((tag) => (
                <Link
                  key={tag}
                  to={`/blog/tag/${encodeURIComponent(tag)}`}
                  className={`blog-category-chip ${selectedTag === tag ? 'active' : ''}`}
                  onClick={() => {
                    // Keep local filtering UX but also navigate
                    setSelectedTag(tag);
                  }}
                >
                  {tag}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Search input */}
        <div className="blog-search-section">
          <input
            type="text"
            className="blog-search-input"
            placeholder="חיפוש במאמרים..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            dir="rtl"
          />
        </div>

        {/* Posts list */}
        <div className="blog-posts-grid">
          {filteredPosts.length === 0 ? (
            <div className="blog-empty-state">
              <p>לא נמצאו מאמרים התואמים לחיפוש.</p>
            </div>
          ) : (
            filteredPosts.map((post) => (
              <Link
                key={post.slug}
                to={`/blog/${post.slug}`}
                className="blog-post-card"
              >
                <h2 className="blog-post-card-title">{post.titleHe}</h2>
                <p className="blog-post-card-excerpt">{post.excerptHe}</p>
                <div className="blog-post-card-meta">
                  <span className="blog-post-card-date">{formatDate(post.publishedAt)}</span>
                  <div className="blog-post-card-tags">
                    {post.tags.map((tag, idx) => (
                      <span key={idx} className="blog-tag">{tag}</span>
                    ))}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
