import { useParams, Link } from 'react-router-dom';
import { useMemo, useEffect } from 'react';
import blogPostsData from '../assets/blogPosts.he.json';
import './BlogTagPage.css';

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

export default function BlogTagPage() {
  const { tag } = useParams<{ tag: string }>();
  const posts = blogPostsData as BlogPost[];

  // Decode tag from URL
  const decodedTag = useMemo(() => {
    if (!tag) return null;
    try {
      return decodeURIComponent(tag);
    } catch {
      return tag;
    }
  }, [tag]);

  // Filter posts by tag
  const filteredPosts = useMemo(() => {
    if (!decodedTag) return [];
    return posts.filter((post) => post.tags?.includes(decodedTag));
  }, [posts, decodedTag]);

  // Set page title
  useEffect(() => {
    if (decodedTag) {
      document.title = `מאמרים בנושא: ${decodedTag} | CarExpert`;
    } else {
      document.title = 'מאמרים | CarExpert';
    }
  }, [decodedTag]);

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

  if (!decodedTag) {
    return (
      <div className="blog-tag-page" dir="rtl">
        <div className="blog-tag-container">
          <div className="blog-tag-not-found">
            <h1>תגית לא נמצאה</h1>
            <p>התגית המבוקשת לא נמצאה.</p>
            <Link to="/blog" className="btn btn-primary">
              חזרה לבלוג
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="blog-tag-page" dir="rtl">
      <div className="blog-tag-container">
        <h1 className="blog-tag-title">מאמרים בנושא: {decodedTag}</h1>
        <Link to="/blog" className="blog-tag-back-link">
          ← חזרה לבלוג
        </Link>

        <div className="blog-tag-posts-grid">
          {filteredPosts.length === 0 ? (
            <div className="blog-tag-empty-state">
              <p>לא נמצאו מאמרים עם התגית "{decodedTag}".</p>
            </div>
          ) : (
            filteredPosts.map((post) => (
              <Link
                key={post.slug}
                to={`/blog/${post.slug}`}
                className="blog-tag-post-card"
              >
                <h2 className="blog-tag-post-card-title">{post.titleHe}</h2>
                <p className="blog-tag-post-card-excerpt">{post.excerptHe}</p>
                <div className="blog-tag-post-card-meta">
                  <span className="blog-tag-post-card-date">{formatDate(post.publishedAt)}</span>
                  <div className="blog-tag-post-card-tags">
                    {post.tags.map((postTag, idx) => (
                      <span key={idx} className="blog-tag">{postTag}</span>
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
