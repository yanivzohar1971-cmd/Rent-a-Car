import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import blogPostsData from '../assets/blogPosts.he.json';
import './BlogPostPage.css';

interface BlogPost {
  slug: string;
  titleHe: string;
  metaDescriptionHe: string;
  excerptHe: string;
  publishedAt: string;
  tags: string[];
  sections: Array<{
    h2He: string;
    bodyHe: string;
  }>;
  faq: Array<{
    qHe: string;
    aHe: string;
  }>;
  cta: {
    primaryLabelHe: string;
    primaryHref: string;
    secondaryLabelHe: string;
    secondaryHref: string;
  };
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const posts = blogPostsData as BlogPost[];
  const post = posts.find((p) => p.slug === slug);

  useEffect(() => {
    if (post) {
      document.title = `${post.titleHe} | CarExpert`;
      
      // Set meta description
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.setAttribute('name', 'description');
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute('content', post.metaDescriptionHe);
    } else {
      document.title = 'מאמר לא נמצא | CarExpert';
    }
  }, [post]);

  if (!post) {
    return (
      <div className="blog-post-page" dir="rtl">
        <div className="blog-post-container">
          <div className="blog-post-not-found">
            <h1>מאמר לא נמצא</h1>
            <p>המאמר שביקשתם לא נמצא.</p>
            <Link to="/blog" className="btn btn-primary">
              חזרה לבלוג
            </Link>
          </div>
        </div>
      </div>
    );
  }

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

  // Find related posts by shared tags (simple scoring)
  const getRelatedPosts = (currentPost: BlogPost, allPosts: BlogPost[], limit: number = 3): BlogPost[] => {
    if (!currentPost.tags || currentPost.tags.length === 0) {
      return [];
    }

    const scored = allPosts
      .filter((p) => p.slug !== currentPost.slug)
      .map((p) => {
        const sharedTags = p.tags?.filter((tag) => currentPost.tags.includes(tag)) || [];
        return { post: p, score: sharedTags.length };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.post);

    return scored;
  };

  const relatedPosts = post ? getRelatedPosts(post, posts, 3) : [];

  return (
    <div className="blog-post-page" dir="rtl">
      <div className="blog-post-container">
        <article className="blog-post-article">
          <header className="blog-post-header">
            <h1 className="blog-post-title">{post.titleHe}</h1>
            <div className="blog-post-meta">
              <span className="blog-post-date">{formatDate(post.publishedAt)}</span>
              <div className="blog-post-tags">
                {post.tags.map((tag, idx) => (
                  <span key={idx} className="blog-tag">{tag}</span>
                ))}
              </div>
            </div>
          </header>

          <div className="blog-post-content">
            {post.sections.map((section, idx) => (
              <section key={idx} className="blog-post-section">
                <h2 className="blog-post-section-title">{section.h2He}</h2>
                <p className="blog-post-section-body">{section.bodyHe}</p>
              </section>
            ))}
          </div>

          {post.faq && post.faq.length > 0 && (
            <div className="blog-post-faq">
              <h2 className="blog-post-faq-title">שאלות נפוצות</h2>
              {post.faq.map((item, idx) => (
                <details
                  key={idx}
                  className="blog-post-faq-item"
                  open={expandedFaq === idx}
                  onToggle={(e) => {
                    setExpandedFaq(e.currentTarget.open ? idx : null);
                  }}
                >
                  <summary className="blog-post-faq-question">{item.qHe}</summary>
                  <div className="blog-post-faq-answer">{item.aHe}</div>
                </details>
              ))}
            </div>
          )}

          <div className="blog-post-cta">
            <h3 className="blog-post-cta-title">מוכנים לפעולה?</h3>
            <div className="blog-post-cta-buttons">
              <Link to={post.cta.primaryHref} className="btn btn-primary btn-large">
                {post.cta.primaryLabelHe}
              </Link>
              <Link to={post.cta.secondaryHref} className="btn btn-secondary btn-large">
                {post.cta.secondaryLabelHe}
              </Link>
            </div>
          </div>
        </article>

        {/* Related posts section */}
        {relatedPosts.length > 0 && (
          <section className="blog-post-related">
            <h2 className="blog-post-related-title">מאמרים קשורים</h2>
            <div className="blog-post-related-grid">
              {relatedPosts.map((relatedPost) => (
                <Link
                  key={relatedPost.slug}
                  to={`/blog/${relatedPost.slug}`}
                  className="blog-post-related-card"
                >
                  <h3 className="blog-post-related-card-title">{relatedPost.titleHe}</h3>
                  <p className="blog-post-related-card-excerpt">{relatedPost.excerptHe}</p>
                  <div className="blog-post-related-card-meta">
                    <span className="blog-post-related-card-date">{formatDate(relatedPost.publishedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
