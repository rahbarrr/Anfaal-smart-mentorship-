'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LayoutDashboard, CalendarCheck, History, LogOut, Menu, X, Sparkles, MoreHorizontal, Bot } from 'lucide-react';
import { MobileHeader } from '@/components/MobileHeader';
import { MobileMoreDrawer, type MoreDrawerLink } from '@/components/MobileMoreDrawer';
import { NotificationCenter } from '@/components/NotificationCenter';
import { InstallAppButton } from '@/pwa/InstallAppButton';
import { useAuth } from '@/context/AuthContext';

const links = [
  { to: '/mentee', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/mentee/daily', label: 'Daily Progress', icon: CalendarCheck, end: false },
  { to: '/mentee/history', label: 'History', icon: History, end: false },
  { to: '/mentee/announcements', label: 'Announcements', icon: Sparkles, end: false },
  { to: '/mentee/chat', label: 'Chat', icon: Sparkles, end: false },
  { to: '/mentee/ai-mentor', label: 'AI Mentor', icon: Bot, end: false },
];

const menteeDrawerLinks: MoreDrawerLink[] = [
  { to: '/mentee', label: 'Learner Dashboard', icon: LayoutDashboard, description: 'Daily schedule, goals & mentor info', end: true },
  { to: '/mentee/daily', label: "Record Today's Progress", icon: CalendarCheck, description: 'Log study hours, Quran & habits' },
  { to: '/mentee/history', label: 'Submission History', icon: History, description: 'Browse and reflect on past entries' },
  { to: '/mentee/ai-mentor', label: 'AI Mentor', icon: Bot, description: 'Get study-planning guidance' },
];

export default function MenteeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);

  return (
    <div className="layout-shell">
      {/* ── Native Mobile Header ──────────────── */}
      <MobileHeader
        portalName="Mentee Portal"
        user={user}
        onOpenMenu={() => setMoreDrawerOpen(true)}
        rightAction={<NotificationCenter />}
      />

      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      {/* ── Sidebar (desktop) ────────────────── */}
      <aside className={`sidebar ${menuOpen ? 'mobile-menu-open' : ''}`} style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="brand-block">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand">Anfaal</div>
            <small>Mentee Portal</small>
          </div>
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

        <nav className="nav-list" style={{ flex: 1 }}>
          {links.map(({ to, label, icon: Icon, end }) => {
            const isActive = end ? pathname === to : pathname.startsWith(to);
            return (
              <Link
                key={to}
                href={to}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 4px', marginBottom: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(143,63,102,0.12)', display: 'grid', placeItems: 'center', fontWeight: 800, color: 'var(--primary)', fontSize: '0.9rem', flexShrink: 0 }}>
              {user?.name?.charAt(0) ?? 'M'}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name ?? 'Mentee'}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Learner</div>
            </div>
          </div>
          <InstallAppButton variant="sidebar" />
          <button className="btn-secondary" style={{ width: '100%', minHeight: 42, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap' }} onClick={() => logout()}>
            <LogOut size={16} />
            <span style={{ whiteSpace: 'nowrap' }}>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────── */}
      <main className="main-panel">
        <header className="topbar">
          <div>
            <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={14} color="var(--primary)" /> Assalamu Alaikum, {user?.name?.split(' ')[0] ?? 'Learner'}
            </div>
            <h2 style={{ fontSize: '1.5rem', marginTop: '4px' }}>Daily Mentee Portal</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <NotificationCenter />
            <button className="btn-primary" onClick={() => router.push('/mentee/daily')}>
              + Record Today's Progress
            </button>
          </div>
        </header>

        {children}
      </main>

      {/* ── Mobile bottom navigation bar ──────── */}
      <nav className="bottom-nav" aria-label="Mobile Mentee Navigation">
        {links.map(({ to, label, icon: Icon, end }) => {
          const isActive = end ? pathname === to : pathname.startsWith(to);
          return (
            <Link
              key={to}
              href={to}
              className={`bottom-nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          );
        })}
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

      {/* ── Mobile More Bottom Sheet Drawer ───── */}
      <MobileMoreDrawer
        isOpen={moreDrawerOpen}
        onClose={() => setMoreDrawerOpen(false)}
        title="Mentee Menu"
        links={menteeDrawerLinks}
        user={user}
        onSignOut={() => logout()}
      />
    </div>
  );
}
