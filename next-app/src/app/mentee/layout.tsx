'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarCheck,
  History,
  LogOut,
  Menu,
  X,
  Sparkles,
  MoreHorizontal,
  Bot,
  UserCircle2,
  MessageSquare,
  PhoneCall,
} from 'lucide-react';
import { MobileHeader } from '@/components/MobileHeader';
import { MobileMoreDrawer, type MoreDrawerLink } from '@/components/MobileMoreDrawer';
import { NotificationCenter } from '@/components/NotificationCenter';
import { InstallAppButton } from '@/pwa/InstallAppButton';
import { useAuth } from '@/context/AuthContext';

const links = [
  { to: '/mentee', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/mentee/daily', label: 'Daily Progress', icon: CalendarCheck, end: false },
  { to: '/mentee/history', label: 'History', icon: History, end: false },
  { to: '/mentee/profile', label: 'My 360 Profile', icon: UserCircle2, end: false },
  { to: '/mentee/announcements', label: 'Announcements', icon: Sparkles, end: false },
  { to: '/mentee/chat', label: 'Chat', icon: MessageSquare, end: false },
  { to: '/mentee/ai-mentor', label: 'AI Mentor', icon: Bot, end: false },
  { to: '/mentee/call-summary', label: 'Call Summaries', icon: PhoneCall, end: false },
];

// Touch-friendly 4-item mobile bottom nav + More drawer
const bottomLinks = [
  { to: '/mentee', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/mentee/daily', label: 'Daily', icon: CalendarCheck, end: false },
  { to: '/mentee/history', label: 'History', icon: History, end: false },
  { to: '/mentee/ai-mentor', label: 'AI Mentor', icon: Bot, end: false },
];

const menteeDrawerLinks: MoreDrawerLink[] = [
  { to: '/mentee', label: 'Learner Dashboard', icon: LayoutDashboard, description: 'Daily schedule, goals & mentor info', end: true },
  { to: '/mentee/daily', label: "Record Today's Progress", icon: CalendarCheck, description: 'Log study hours, Quran & habits' },
  { to: '/mentee/history', label: 'Submission History', icon: History, description: 'Browse and reflect on past entries' },
  { to: '/mentee/profile', label: 'My 360 Profile', icon: UserCircle2, description: 'Academic benchmarks, exams, routine & interests' },
  { to: '/mentee/ai-mentor', label: 'AI Mentor', icon: Bot, description: 'Interactive guidance & study-planning support' },
  { to: '/mentee/chat', label: 'In-App Chat', icon: MessageSquare, description: 'Private direct messaging with your mentor' },
  { to: '/mentee/announcements', label: 'Announcements', icon: Sparkles, description: 'Notices from Anfaal administrators' },
  { to: '/mentee/call-summary', label: 'Call Summaries', icon: PhoneCall, description: 'Mentor calls & session takeaways' },
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
            className="mobile-close-btn"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="nav-list">
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

        {/* Desktop Sidebar Footer */}
        <div className="sidebar-footer" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ padding: '0 0.5rem' }}>
            <InstallAppButton variant="secondary" />
          </div>

          <div className="sidebar-user-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div className="sidebar-user-info" style={{ minWidth: 0 }}>
              <div className="sidebar-user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name ?? 'Mentee'}
              </div>
              <div className="sidebar-user-role">Learner</div>
            </div>
            <button
              className="btn-icon"
              title="Sign out"
              onClick={async () => {
                await logout();
              }}
              style={{ flexShrink: 0 }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content area ────────────────── */}
      <main className="main-panel">
        <header className="topbar">
          <button
            className="mobile-menu-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu size={22} />
          </button>
          <div style={{ flex: 1 }} />
          <div className="topbar-actions">
            <InstallAppButton variant="secondary" />
            <NotificationCenter />
            <div className="avatar-chip">
              <div className="avatar-chip-circle">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'ME'}
              </div>
              <div className="avatar-chip-text">
                <span className="avatar-chip-name">{user?.name ?? 'Mentee'}</span>
                <span className="avatar-chip-role">Learner</span>
              </div>
            </div>
          </div>
        </header>

        {children}
      </main>

      {/* ── Mobile bottom navigation bar ──────── */}
      <nav className="bottom-nav" aria-label="Mobile Mentee Navigation">
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
        title="Mentee Menu"
        links={menteeDrawerLinks}
        user={user}
        onSignOut={() => logout()}
      />
    </div>
  );
}
