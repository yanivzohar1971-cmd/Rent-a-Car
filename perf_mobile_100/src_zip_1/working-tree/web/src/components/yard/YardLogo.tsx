import './YardLogo.css';

interface YardLogoProps {
  url?: string | null;
  size?: number;
  className?: string;
  variant?: 'headerWide' | 'square';
}

/**
 * YardLogo component - displays yard logo image or placeholder
 * 
 * @param url - Logo image URL from Firebase Storage
 * @param size - Logo size in pixels (default: 56)
 * @param className - Additional CSS classes
 */
export default function YardLogo({ url, size = 56, className = '', variant = 'square' }: YardLogoProps) {
  const isHeaderWide = variant === 'headerWide';
  
  const sizeStyle = isHeaderWide ? {
    height: '70px',
    minHeight: '70px',
    maxWidth: '160px',
    width: 'auto',
  } : {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    minHeight: `${size}px`,
  };

  if (url) {
    return (
      <div className={`yard-logo ${isHeaderWide ? 'yard-logo-header-wide' : ''} ${className}`} style={sizeStyle}>
        <img
          src={url}
          alt="Yard logo"
          className="yard-logo-image"
        />
      </div>
    );
  }

  // Placeholder when no logo
  return (
    <div className={`yard-logo yard-logo-placeholder ${isHeaderWide ? 'yard-logo-header-wide' : ''} ${className}`} style={sizeStyle}>
      <span className="yard-logo-placeholder-icon">🏢</span>
    </div>
  );
}
