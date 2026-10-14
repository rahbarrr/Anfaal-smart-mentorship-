import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserRound,
  FileText,
  BarChart3,
  FileSpreadsheet,
  Link2,
  ClipboardCheck,
  LogOut,
  Menu,
  X,
  CalendarCheck,
  UploadCloud,
  PhoneCall,
  MoreHorizontal
} from 'lucide-react';
import { MobileHeader } from '../components/MobileHeader';
import { MobileMoreDrawer, type MoreDrawerLink } from '../components/MobileMoreDrawer';
import { NotificationCenter } from '../components/NotificationCenter';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { InstallAppButton } from '../pwa/InstallAppButton';

const links = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/calls', label: 'Call Records', icon: PhoneCall, end: false },
  { to: '/admin/mentors', label: 'Mentors', icon: Users, end: false },
  { to: '/admin/mentees', label: 'Mentees', icon: UserRound, end: false },
  { to: '/admin/assignments', label: 'Assign', icon: Link2, end: false },
  { to: '/admin/bulk-import', label: 'Bulk Import', icon: UploadCloud, end: false },
  { to: '/admin/performance', label: 'Performance', icon: CalendarCheck, end: false },
  { to: '/admin/reviews', label: 'Reviews', icon: ClipboardCheck, end: false },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, end: false },
  { to: '/admin/reports', label: 'Reports', icon: FileSpreadsheet, end: false },
];

const sidebarOnlyLinks = [
  { to: '/admin/mentorships', label: 'Mentorships', icon: FileText, end: false },
];

const allLinks = [...links.slice(0, 1), ...sidebarOnlyLinks, ...links.slice(1)];

// 4 primary destinations on mobile bottom bar (+ More button)
const bottomLinks = [
  { to: '/admin', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/admin/mentees', label: 'Mentees', icon: UserRound, end: false },
  { to: '/admin/mentors', label: 'Mentors', icon: Users, end: false },
  { to: '/admin/calls', label: 'Calls', icon: PhoneCall, end: false },
];

// Secondary items accessible in mobile drawer
const adminDrawerLinks: MoreDrawerLink[] = [
  { to: '/admin/assignments', label: 'Assignments', icon: Link2, description: 'Assign mentees to mentors' },
  { to: '/admin/bulk-import', label: 'Bulk Import', icon: UploadCloud, description: 'Upload mentee CSV datasets' },
  { to: '/admin/performance', label: 'Performance', icon: CalendarCheck, description: 'Daily student logs & multi-select' },
  { to: '/admin/reviews', label: 'Reviews', icon: ClipboardCheck, description: 'Mentor call evaluation forms' },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, description: 'High-level mentorship insights' },
  { to: '/admin/reports', label: 'Reports', icon: FileSpreadsheet, description: 'Export performance logs & data' },
  { to: '/admin/mentorships', label: 'Mentorships', icon: FileText, description: 'Pairing status and records' },
];

function getStoredUser() {
  try {
    const raw = localStorage.getItem('anfaal-user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AdminLayout() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

  const handleSignOut = () => {
    localStorage.removeItem('anfaal-token');
    localStorage.removeItem('anfaal-user');
    navigate('/', { replace: true });
  };

  return (
    <div className="layout-shell">
      {/* ── Native-feeling Mobile Header (phones & tablets) ──────────────── */}
      <MobileHeader
        portalName="Admin Portal"
        user={user}
        onOpenMenu={() => setMoreDrawerOpen(true)}
        rightAction={<NotificationCenter />}
      />

      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      {/* ── Sidebar / top header (desktop & tablet drawer) ────────────────── */}
      <aside className={`sidebar ${menuOpen ? 'mobile-menu-open' : ''}`} style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="brand-block">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand">Anfaal</div>
            <small>Mentorship Portal</small>
          </div>
          {/* Tablet hamburger */}
          <button
            className="mobile-menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Desktop / tablet nav */}
        <nav className="nav-list" style={{ flex: 1 }}>
          {allLinks.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px', marginBottom: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(143,63,102,0.12)', display: 'grid', placeItems: 'center', fontWeight: 800, color: 'var(--primary)', fontSize: '0.9rem', flexShrink: 0 }}>
              {user?.name?.charAt(0) ?? 'A'}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name ?? 'Admin'}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Administrator</div>
            </div>
          </div>
          <InstallAppButton variant="sidebar" />
          <button className="btn-secondary" style={{ width: '100%', minHeight: 42, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap' }} onClick={handleSignOut}>
            <LogOut size={16} />
            <span style={{ whiteSpace: 'nowrap' }}>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="main-panel">
        <header className="topbar">
          <div>
            <div className="eyebrow">Anfaal Mentorship Dashboard</div>
            <h2 style={{ fontSize: '1.5rem', marginTop: '4px' }}>Operations overview</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <NotificationCenter />
            <button className="btn-primary" onClick={() => navigate('/admin/reports')}>Export Report</button>
          </div>
        </header>

        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>

      {/* ── Mobile bottom navigation bar ─────────────────────────────────── */}
      <nav className="bottom-nav" aria-label="Mobile Admin Navigation">
        {bottomLinks.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`bottom-nav-item ${moreDrawerOpen ? 'active' : ''}`}
          onClick={() => setMoreDrawerOpen(true)}
          aria-label="Open more options menu"
        >
          <MoreHorizontal size={20} />
          <span>More</span>
        </button>
      </nav>

      {/* ── Mobile More Bottom Sheet Drawer ──────────────────────────────── */}
      <MobileMoreDrawer
        isOpen={moreDrawerOpen}
        onClose={() => setMoreDrawerOpen(false)}
        title="Admin Menu"
        links={adminDrawerLinks}
        user={user}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
