'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Upload, FileText, UserCircle2, LogOut, Menu, X, MoreHorizontal } from 'lucide-react';
import { MobileHeader } from '@/components/MobileHeader';
import { MobileMoreDrawer, type MoreDrawerLink } from '@/components/MobileMoreDrawer';
import { NotificationCenter } from '@/components/NotificationCenter';
import { InstallAppButton } from '@/pwa/InstallAppButton';
import { useAuth } from '@/context/AuthContext';

const links = [
  { to: '/mentor', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/mentor/mentees', label: 'Mentees', icon: Users, end: false },
  { to: '/mentor/upload', label: 'Upload', icon: Upload, end: false },
  { to: '/mentor/calls', label: 'Calls', icon: FileText, end: false },
  { to: '/mentor/profile', label: 'Profile', icon: UserCircle2, end: false },
  { to: '/mentor/attendance', label: 'Attendance', icon: FileText, end: false },
  { to: '/mentor/whatsapp', label: 'WhatsApp Update', icon: FileText, end: false },
  { to: '/mentor/chat', label: 'Chat', icon: FileText, end: false },
  { to: '/mentor/announcements', label: 'Announcements', icon: FileText, end: false },
];

const bottomLinks = [
  { to: '/mentor', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/mentor/mentees', label: 'Mentees', icon: Users, end: false },
  { to: '/mentor/calls', label: 'Calls', icon: FileText, end: false },
  { to: '/mentor/upload', label: 'Upload', icon: Upload, end: false },
];

const mentorDrawerLinks: MoreDrawerLink[] = [
  { to: '/mentor/profile', label: 'My Profile', icon: UserCircle2, description: 'Personal details & account settings' },
  { to: '/mentor/calls', label: 'Call History', icon: FileText, description: 'All recorded sessions and transcripts' },
  { to: '/mentor/upload', label: 'Upload Recording', icon: Upload, description: 'Upload audio for AI transcription' },
  { to: '/mentor/attendance', label: 'Attendance', icon: FileText, description: 'Track mentee monthly attendance' },
  { to: '/mentor/whatsapp', label: 'WhatsApp Update', icon: FileText, description: 'Record manual session summary' },
  { to: '/mentor/chat', label: 'In-app Chat', icon: FileText, description: 'Message assigned students' },
  { to: '/mentor/announcements', label: 'Announcements', icon: FileText, description: 'Community notices & updates' },
];

export default function MentorLayout({
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
        portalName="Mentor Portal"
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
            <small>Mentor Portal</small>
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
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name ?? 'Mentor'}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email ?? ''}</div>
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
            <div className="eyebrow">Welcome back, {user?.name ?? 'Mentor'}</div>
            <h2 style={{ fontSize: '1.5rem', marginTop: '4px' }}>Mentor dashboard</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <NotificationCenter />
            <button className="btn-primary" onClick={() => router.push('/mentor/upload')}>+ Upload Call</button>
          </div>
        </header>

        {children}
      </main>

      {/* ── Mobile bottom navigation bar ──────── */}
      <nav className="bottom-nav" aria-label="Mobile Navigation">
        {bottomLinks.map(({ to, label, icon: Icon, end }) => {
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
        title="Mentor Menu"
        links={mentorDrawerLinks}
        user={user}
        onSignOut={() => logout()}
      />
    </div>
  );
}
