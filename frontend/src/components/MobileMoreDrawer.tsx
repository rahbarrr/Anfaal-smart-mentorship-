import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { X, LogOut, Download, CheckCircle2, type LucideIcon } from 'lucide-react';
import { usePwaInstall } from '../pwa/PwaContext';

export interface MoreDrawerLink {
  to: string;
  label: string;
  icon: LucideIcon;
  description?: string;
  badge?: string | number;
  end?: boolean;
}

interface MobileMoreDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  links: MoreDrawerLink[];
  user: {
    name?: string;
    email?: string;
    role?: string;
  } | null;
  onSignOut: () => void;
}

export function MobileMoreDrawer({
  isOpen,
  onClose,
  title = 'More Options',
  links,
  user,
  onSignOut,
}: MobileMoreDrawerProps) {
  const { isInstalled, triggerInstall } = usePwaInstall();
  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'A';

  return (
    <div
      className="mobile-drawer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="mobile-drawer-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle pill */}
        <div className="mobile-drawer-handle" />

        {/* Drawer Header */}
        <div className="mobile-drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div className="mobile-drawer-avatar">{initial}</div>
            <div style={{ minWidth: 0 }}>
              <div className="mobile-drawer-user-name">{user?.name || 'User'}</div>
              <div className="mobile-drawer-user-role">
                {user?.role ? user.role.charAt(0) + user.role.slice(1).toLowerCase() : user?.email || 'Account'}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="mobile-drawer-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Grid / List */}
        <div className="mobile-drawer-body">
          <div className="mobile-drawer-section-label">Navigation & Features</div>
          <div className="mobile-drawer-grid">
            {links.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `mobile-drawer-item ${isActive ? 'active' : ''}`
                  }
                  onClick={onClose}
                >
                  <div className="mobile-drawer-icon-wrap">
                    <Icon size={20} />
                  </div>
                  <div className="mobile-drawer-item-text">
                    <div className="mobile-drawer-item-label">{link.label}</div>
                    {link.description && (
                      <div className="mobile-drawer-item-desc">{link.description}</div>
                    )}
                  </div>
                  {link.badge !== undefined && (
                    <span className="mobile-drawer-badge">{link.badge}</span>
                  )}
                </NavLink>
              );
            })}
          </div>

          {/* Permanent PWA Install Option */}
          <div style={{ marginTop: 14 }}>
            <div className="mobile-drawer-section-label">Application</div>
            <button
              type="button"
              className="mobile-drawer-item"
              id="mobile-drawer-install-btn"
              onClick={() => {
                onClose();
                triggerInstall();
              }}
              style={{
                width: '100%',
                cursor: 'pointer',
                textAlign: 'left',
                border: isInstalled ? '1px solid rgba(46, 139, 87, 0.25)' : '1px solid var(--border)',
                background: isInstalled ? 'rgba(46, 139, 87, 0.04)' : '#fff',
              }}
            >
              <div
                className="mobile-drawer-icon-wrap"
                style={isInstalled ? { background: 'rgba(46, 139, 87, 0.1)', color: '#2e7d32' } : {}}
              >
                {isInstalled ? <CheckCircle2 size={20} /> : <Download size={20} />}
              </div>
              <div className="mobile-drawer-item-text">
                <div className="mobile-drawer-item-label" style={isInstalled ? { color: '#2e7d32' } : {}}>
                  {isInstalled ? 'Anfaal is Installed' : 'Install Anfaal'}
                </div>
                <div className="mobile-drawer-item-desc">
                  {isInstalled
                    ? 'Running as installed home screen app'
                    : 'Download app to your home screen'}
                </div>
              </div>
              <span
                className="mobile-drawer-badge"
                style={
                  isInstalled
                    ? { background: 'rgba(46, 139, 87, 0.12)', color: '#2e7d32' }
                    : { background: 'rgba(143, 63, 102, 0.1)', color: 'var(--primary)' }
                }
              >
                {isInstalled ? 'Installed' : 'App'}
              </span>
            </button>
          </div>
        </div>

        {/* Drawer Footer: Sign Out */}
        <div className="mobile-drawer-footer">
          <button
            type="button"
            className="mobile-drawer-signout"
            onClick={() => {
              onClose();
              onSignOut();
            }}
          >
            <LogOut size={18} />
            <span>Sign out of Anfaal</span>
          </button>
        </div>
      </div>
    </div>
  );
}
