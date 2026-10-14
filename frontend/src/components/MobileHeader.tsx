import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, MoreVertical } from 'lucide-react';
import type { ReactNode } from 'react';

interface MobileHeaderProps {
  portalName: string;
  user?: {
    name?: string;
    email?: string;
    role?: string;
  } | null;
  onOpenMenu?: () => void;
  rightAction?: ReactNode;
  customTitle?: string;
  backTo?: string;
}

export function MobileHeader({
  portalName,
  user,
  onOpenMenu,
  rightAction,
  customTitle,
  backTo,
}: MobileHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const primaryTabs = new Set([
    '/admin', '/admin/mentees', '/admin/mentors', '/admin/calls',
    '/mentor', '/mentor/mentees', '/mentor/calls', '/mentor/upload',
    '/mentee', '/mentee/history'
  ]);

  const routeTitles: Record<string, string> = {
    '/admin': 'Dashboard',
    '/admin/mentees': 'Mentees',
    '/admin/mentors': 'Mentors',
    '/admin/calls': 'Call Records',
    '/admin/assignments': 'Assignments',
    '/admin/bulk-import': 'Bulk Import',
    '/admin/performance': 'Daily Performance',
    '/admin/reviews': 'Reviews',
    '/admin/analytics': 'Analytics',
    '/admin/reports': 'Reports',
    '/admin/mentorships': 'Mentorships',
    '/mentor': 'Dashboard',
    '/mentor/mentees': 'My Mentees',
    '/mentor/calls': 'Call Recordings',
    '/mentor/upload': 'Upload Call',
    '/mentor/profile': 'My Profile',
    '/mentee': 'Dashboard',
    '/mentee/daily': "Daily Progress",
    '/mentee/history': 'History',
  };

  const isSubRoute = Boolean(backTo || !primaryTabs.has(location.pathname));

  const handleBack = () => {
    if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'A';
  const pageTitle = customTitle || routeTitles[location.pathname] || portalName;

  return (
    <header className="mobile-app-header">
      <div className="mobile-app-header-inner">
        {/* Left Side: Back button OR Brand Mark */}
        {isSubRoute ? (
          <button
            type="button"
            className="mobile-header-back-btn"
            onClick={handleBack}
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
        ) : (
          <div className="mobile-header-brand">
            <div className="brand-mark">A</div>
            <div className="mobile-header-brand-text">
              <span className="brand-title">Anfaal</span>
              <span className="brand-subtitle">{portalName}</span>
            </div>
          </div>
        )}

        {/* Center / Title: if subroute or custom title */}
        {isSubRoute && (
          <div className="mobile-header-title">
            {pageTitle}
          </div>
        )}

        {/* Right Side: Quick Action or Avatar / Menu Toggle */}
        <div className="mobile-header-actions">
          {rightAction}

          {onOpenMenu && (
            <button
              type="button"
              className="mobile-header-menu-btn"
              onClick={onOpenMenu}
              aria-label="Open menu"
            >
              <div className="mobile-header-avatar">{initial}</div>
              <MoreVertical size={18} className="mobile-header-dots" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
