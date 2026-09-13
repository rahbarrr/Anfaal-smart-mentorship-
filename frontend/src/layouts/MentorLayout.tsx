import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Upload, FileText, UserCircle2, LogOut } from 'lucide-react';

const links = [
  { to: '/mentor', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/mentor/mentees', label: 'My Mentees', icon: Users, end: false },
  { to: '/mentor/upload', label: 'Upload Call', icon: Upload, end: false },
  { to: '/mentor/calls', label: 'My Calls', icon: FileText, end: false },
  { to: '/mentor/profile', label: 'Profile', icon: UserCircle2, end: false },
];

function getStoredUser() {
  try {
    const raw = localStorage.getItem('anfaal-user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function MentorLayout() {
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
            <small>Mentor Portal</small>
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
              {user?.name?.charAt(0) ?? 'M'}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{user?.name ?? 'Mentor'}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{user?.email ?? ''}</div>
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
            <div className="eyebrow">Welcome back, {user?.name ?? 'Mentor'}</div>
            <h2 style={{ fontSize: '1.5rem', marginTop: '4px' }}>Mentor dashboard</h2>
          </div>
          <button className="btn-primary" onClick={() => navigate('/mentor/upload')}>+ Upload Call</button>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
