import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Resvg } from "@resvg/resvg-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const svgPath = path.join(webRoot, "public", "seo-placeholder.svg");
const pngPath = path.join(webRoot, "public", "seo-placeholder.png");

try {
  // Read SVG file
  if (!fs.existsSync(svgPath)) {
    console.error(`[gen-seo-placeholder] Error: SVG file not found at ${svgPath}`);
    process.exit(1);
  }

  const svgContent = fs.readFileSync(svgPath, "utf8");

  // Render SVG to PNG at 1200×630
  const resvg = new Resvg(svgContent, {
    fitTo: {
      mode: "width",
      value: 1200,
    },
  });

  const pngData = resvg.render().asPng();

  // Write PNG file
  fs.writeFileSync(pngPath, pngData);

  console.log(`[gen-seo-placeholder] Generated ${pngPath} (1200×630)`);
} catch (error) {
  console.error(`[gen-seo-placeholder] Error generating PNG:`, error.message);
  process.exit(1);
}
