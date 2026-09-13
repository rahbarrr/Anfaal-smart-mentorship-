import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, UserRound, FileText, BarChart3, FileSpreadsheet, Link2, ClipboardCheck, LogOut } from 'lucide-react';

const links = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/mentors', label: 'Mentors', icon: Users, end: false },
  { to: '/admin/mentees', label: 'Mentees', icon: UserRound, end: false },
  { to: '/admin/mentorships', label: 'Mentorships', icon: FileText, end: false },
  { to: '/admin/assignments', label: 'Assignments', icon: Link2, end: false },
  { to: '/admin/reviews', label: 'Reviews', icon: ClipboardCheck, end: false },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, end: false },
  { to: '/admin/reports', label: 'Reports', icon: FileSpreadsheet, end: false },
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

  const handleSignOut = () => {
    localStorage.removeItem('anfaal-token');
    localStorage.removeItem('anfaal-user');
    navigate('/', { replace: true });
  };

  return (
    <div className="layout-shell">
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="brand-block">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand">Anfaal</div>
            <small>Mentorship Portal</small>
          </div>
        </div>

        <nav className="nav-list" style={{ flex: 1 }}>
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px', marginBottom: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(143,63,102,0.12)', display: 'grid', placeItems: 'center', fontWeight: 800, color: 'var(--primary)', fontSize: '0.9rem' }}>
              {user?.name?.charAt(0) ?? 'A'}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{user?.name ?? 'Admin'}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Administrator</div>
            </div>
          </div>
          <button className="btn-secondary" style={{ width: '100%' }} onClick={handleSignOut}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <LogOut size={16} />
              Sign out
            </span>
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <div className="eyebrow">Anfaal Mentorship Dashboard</div>
            <h2 style={{ fontSize: '1.5rem', marginTop: '4px' }}>Operations overview</h2>
          </div>
          <button className="btn-primary" onClick={() => navigate('/admin/reports')}>Export Report</button>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
