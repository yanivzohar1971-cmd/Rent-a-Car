import { useAuth } from '../../context/AuthContext';
import YardLogo from './YardLogo';
import './YardPageHeader.css';

interface YardPageHeaderProps {
  title: string;
  actions?: React.ReactNode;
}

/**
 * YardPageHeader component - reusable header for all Yard pages
 * 
 * Layout: 3-column grid with title (right), logo (center), actions (left)
 * The logo is visually centered between title and actions.
 */
export default function YardPageHeader({ title, actions }: YardPageHeaderProps) {
  const { userProfile } = useAuth();
  const logoUrl = userProfile?.yardLogoUrl ?? null;

  return (
    <div className="yard-page-header">
      <div className="yard-page-header-title">
        <h1 className="page-title">{title}</h1>
      </div>
      <div className="yard-page-header-logo">
        <YardLogo url={logoUrl} variant="headerWide" />
      </div>
      <div className="yard-page-header-actions">
        {actions}
      </div>
    </div>
  );
}
