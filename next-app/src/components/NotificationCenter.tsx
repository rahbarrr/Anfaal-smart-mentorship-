'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCheck,
  Settings,
  X,
  PhoneCall,
  CalendarCheck,
  UserPlus,
  AlertTriangle,
  Info,
  ChevronRight,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  sendTestPushNotification,
  getToken,
  type InAppNotification,
  type NotificationPreferences,
} from '@/lib/api';
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/pwa/pwaNotifications';
import { InstallAppButton } from '@/pwa/InstallAppButton';

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';

    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function getNotificationIcon(type: string) {
  switch (type) {
    case 'CALL_PROCESSING_COMPLETED':
    case 'CALL_SUMMARY_AVAILABLE':
    case 'CALL_TRANSCRIPT_AVAILABLE':
      return <PhoneCall size={16} className="text-primary" />;
    case 'MENTEE_DAILY_SUBMITTED':
    case 'DAILY_RESPONSE_REMINDER':
    case 'MENTEE_GOAL_UPDATED':
    case 'MENTEE_ACADEMIC_PROGRESS_UPDATED':
      return <CalendarCheck size={16} className="text-emerald-600" />;
    case 'NEW_MENTOR_REGISTRATION':
    case 'MENTOR_APPROVAL_REQUIRED':
    case 'NEW_MENTEE_REGISTRATION':
    case 'ASSIGNED_MENTEE':
    case 'NEW_MENTOR_ASSIGNMENT':
      return <UserPlus size={16} className="text-indigo-600" />;
    case 'CALL_PROCESSING_FAILED':
    case 'STORAGE_UPLOAD_FAILURE':
    case 'SYSTEM_EVENT':
      return <AlertTriangle size={16} className="text-amber-600" />;
    default:
      return <Info size={16} className="text-muted-foreground" />;
  }
}

export function NotificationCenter() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [view, setView] = useState<'list' | 'settings'>('list');

  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Push & Preference States
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    pushEnabled: true,
    dailyReminders: true,
    mentorshipActivity: true,
    callUpdates: true,
    systemNotifications: true,
  });
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>('default');
  const [pushLoading, setPushLoading] = useState(false);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);
  const [testPushLoading, setTestPushLoading] = useState(false);
  const [testPushResult, setTestPushResult] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Check Web Push support & initial permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(Notification.permission);
    }
  }, []);

  // Poll unread count every 60s
  const fetchUnreadCount = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const data = await getUnreadNotificationCount(token);
      setUnreadCount(data.unreadCount);
    } catch {
      // ignore background polling failure
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchUnreadCount]);

  // Fetch notifications list when open
  const loadNotifications = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const data = await getNotifications(token, {
        limit: 30,
        unreadOnly: activeTab === 'unread',
      });
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (isOpen && view === 'list') {
      void loadNotifications();
    }
  }, [isOpen, view, activeTab, loadNotifications]);

  // Fetch preferences when settings view is opened
  useEffect(() => {
    if (isOpen && view === 'settings') {
      const token = getToken();
      if (!token) return;
      getNotificationPreferences(token)
        .then((data) => setPreferences((data as any).preferences ?? data))
        .catch((err) => console.error('Failed to load notification preferences:', err));
    }
  }, [isOpen, view]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Mark single notification as read
  const handleMarkAsRead = async (notification: InAppNotification) => {
    if (notification.read) return;
    const token = getToken();
    if (!token) return;

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await markNotificationAsRead(token, notification.id);
    } catch {
      // Revert on failure
      void loadNotifications();
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    const token = getToken();
    if (!token) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      await markAllNotificationsAsRead(token);
    } catch {
      void loadNotifications();
    }
  };

  // Handle clicking on a notification item
  const handleItemClick = (notification: InAppNotification) => {
    void handleMarkAsRead(notification);
    setIsOpen(false);
    if (notification.link) {
      router.push(notification.link);
    }
  };

  // Push Permission & Subscription workflow
  const handleEnablePush = async () => {
    if (!isPushSupported()) {
      setPushStatusMessage('Push notifications are not supported on this browser or platform.');
      return;
    }

    setPushLoading(true);
    setPushStatusMessage(null);

    try {
      const token = getToken();
      if (!token) {
        setPushStatusMessage('Please sign in to enable notifications.');
        setPushLoading(false);
        return;
      }

      const res = await subscribeToPush(token);
      setBrowserPermission(Notification.permission);
      setPushStatusMessage(res.message);
      if (res.success) {
        setPreferences((p) => ({ ...p, pushEnabled: true }));
      }
    } catch (err: unknown) {
      console.error('Push registration error:', err);
      const message = err instanceof Error ? err.message : 'Failed to enable push notifications';
      setPushStatusMessage(message);
    } finally {
      setPushLoading(false);
    }
  };

  const handleDisablePush = async () => {
    setPushLoading(true);
    setPushStatusMessage(null);
    try {
      const token = getToken();
      await unsubscribeFromPush(token || undefined);
      setPreferences((p) => ({ ...p, pushEnabled: false }));
      setPushStatusMessage('Push notifications turned off.');
    } catch (err: unknown) {
      console.error('Push unregister error:', err);
      setPushStatusMessage('Failed to disable push notifications');
    } finally {
      setPushLoading(false);
    }
  };

  const handleSendTestPush = async () => {
    setTestPushLoading(true);
    setTestPushResult(null);
    try {
      const token = getToken();
      if (!token) {
        setTestPushResult('Please sign in first.');
        return;
      }
      const res = await sendTestPushNotification(token, {
        title: 'Anfaal Test Notification',
        message: 'Background push notifications are working correctly!',
        link: '/',
      });
      setTestPushResult(res.message);
      void loadNotifications();
      void fetchUnreadCount();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to dispatch test notification.';
      setTestPushResult(message);
    } finally {
      setTestPushLoading(false);
    }
  };

  const handleTogglePreference = async (key: keyof NotificationPreferences) => {
    const token = getToken();
    const updated = { ...preferences, [key]: !preferences[key] };
    setPreferences(updated);
    if (token) {
      try {
        await updateNotificationPreferences(token, { [key]: updated[key] });
      } catch (err) {
        console.error('Failed to update preference:', err);
      }
    }
  };

  const filteredNotifications =
    activeTab === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  return (
    <div className="notification-center-root" ref={containerRef}>
      {/* ── Bell Trigger Button ────────────────────────────────────────── */}
      <button
        type="button"
        className={`notification-bell-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
      >
        <Bell size={20} className="notification-bell-icon" />
        {unreadCount > 0 && (
          <span className="notification-bell-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Notification Dropdown / Mobile Sheet ──────────────────────── */}
      {isOpen && (
        <>
          {/* Mobile Backdrop */}
          <div
            className="notification-backdrop"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <div
            className="notification-panel"
            role="dialog"
            aria-label="Notification Center"
          >
            {/* Header */}
            <div className="notification-header">
              <div className="notification-header-title">
                <span className="font-bold text-base text-gray-900">Notifications</span>
                {unreadCount > 0 && (
                  <span className="notification-counter-chip">{unreadCount} new</span>
                )}
              </div>
              <div className="notification-header-actions">
                {view === 'list' ? (
                  <>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        className="notification-header-btn"
                        onClick={handleMarkAllRead}
                        title="Mark all as read"
                      >
                        <CheckCheck size={16} />
                        <span className="text-xs">Mark all read</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="notification-header-icon-btn"
                      onClick={() => setView('settings')}
                      title="Notification settings"
                      aria-label="Notification settings"
                    >
                      <Settings size={18} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="notification-header-btn"
                    onClick={() => {
                      setView('list');
                      setPushStatusMessage(null);
                    }}
                  >
                    <span>Back to list</span>
                  </button>
                )}
                <button
                  type="button"
                  className="notification-header-icon-btn"
                  onClick={() => setIsOpen(false)}
                  title="Close"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* View: List */}
            {view === 'list' && (
              <>
                {/* Tabs */}
                <div className="notification-tabs">
                  <button
                    type="button"
                    className={`notification-tab ${activeTab === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveTab('all')}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`notification-tab ${activeTab === 'unread' ? 'active' : ''}`}
                    onClick={() => setActiveTab('unread')}
                  >
                    Unread {unreadCount > 0 && `(${unreadCount})`}
                  </button>
                </div>

                {/* Notifications List */}
                <div className="notification-list-scroll">
                  {loading ? (
                    <div className="notification-loading-state">
                      <div className="loading-spinner" />
                      <span>Loading notifications…</span>
                    </div>
                  ) : filteredNotifications.length === 0 ? (
                    <div className="notification-empty-state">
                      <Bell size={32} className="text-muted-foreground opacity-40 mb-2" />
                      <p className="text-sm font-medium text-gray-600">No notifications yet</p>
                      <p className="text-xs text-muted-foreground">
                        {activeTab === 'unread'
                          ? "You're all caught up! No unread notifications."
                          : "We'll let you know when important updates arrive."}
                      </p>
                    </div>
                  ) : (
                    <div className="notification-cards-wrapper">
                      {filteredNotifications.map((item) => (
                        <div
                          key={item.id}
                          className={`notification-card ${!item.read ? 'unread' : 'read'}`}
                          onClick={() => handleItemClick(item)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') handleItemClick(item);
                          }}
                        >
                          <div className="notification-card-icon">
                            {getNotificationIcon(item.type)}
                          </div>
                          <div className="notification-card-content">
                            <div className="notification-card-header">
                              <span className="notification-card-title">{item.title}</span>
                              {!item.read && <span className="notification-unread-dot" />}
                            </div>
                            <p className="notification-card-message">{item.message}</p>
                            <div className="notification-card-footer">
                              <span className="notification-card-time">
                                {formatRelativeTime(item.createdAt)}
                              </span>
                              {item.link && (
                                <span className="notification-card-action">
                                  <span>View</span>
                                  <ChevronRight size={13} />
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* View: Settings & Push Permissions */}
            {view === 'settings' && (
              <div className="notification-settings-body">
                {/* Push Notification Section */}
                <div className="notification-settings-section">
                  <div className="settings-section-header">
                    <Smartphone size={18} className="text-primary" />
                    <div>
                      <h4 className="font-semibold text-sm text-gray-900">Stay updated with Anfaal</h4>
                      <p className="text-xs text-gray-500">
                        Receive notifications for daily responses, call summaries and important mentorship activity.
                      </p>
                    </div>
                  </div>

                  {browserPermission === 'denied' ? (
                    <div className="notification-alert-box alert-denied">
                      <ShieldAlert size={16} />
                      <div>
                        <strong>Notifications are blocked in your browser.</strong>
                        <p>To enable them, click the lock/settings icon next to the address bar and allow notifications for this site.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="push-action-card">
                      {preferences.pushEnabled && browserPermission === 'granted' ? (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                            ✓ Notifications Active on this device
                          </span>
                          <button
                            type="button"
                            className="btn-secondary text-xs"
                            disabled={pushLoading}
                            onClick={handleDisablePush}
                          >
                            {pushLoading ? 'Updating…' : 'Disable'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary w-full text-xs font-semibold"
                          disabled={pushLoading}
                          onClick={handleEnablePush}
                        >
                          {pushLoading ? 'Enabling…' : 'Enable Notifications'}
                        </button>
                      )}
                    </div>
                  )}

                  {pushStatusMessage && (
                    <p className="text-xs text-primary font-medium mt-1">
                      {pushStatusMessage}
                    </p>
                  )}

                  {/* Test Push Trigger */}
                  <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                    <button
                      type="button"
                      className="btn-secondary w-full text-xs"
                      disabled={testPushLoading}
                      onClick={handleSendTestPush}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        padding: '0.5rem 0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      <Bell size={13} />
                      {testPushLoading ? 'Sending Test…' : 'Send Test Notification to This Device'}
                    </button>
                    {testPushResult && (
                      <p
                        className="text-xs font-medium mt-1.5"
                        style={{
                          color: testPushResult.toLowerCase().includes('fail') || testPushResult.toLowerCase().includes('no active') ? 'var(--danger)' : 'var(--primary)',
                          margin: '0.35rem 0 0 0',
                          lineHeight: 1.4,
                        }}
                      >
                        {testPushResult}
                      </p>
                    )}
                  </div>
                </div>

                {/* Categories Section */}
                <div className="notification-settings-section">
                  <h4 className="font-semibold text-sm text-gray-900 mb-2">
                    Notification Categories
                  </h4>
                  <div className="settings-toggle-list">
                    <label className="settings-toggle-row">
                      <div className="settings-toggle-info">
                        <span className="settings-toggle-title">Daily Response Reminders</span>
                        <span className="settings-toggle-desc">
                          Get notified when your daily progress report is due
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={preferences.dailyReminders}
                        onChange={() => handleTogglePreference('dailyReminders')}
                        className="toggle-checkbox"
                      />
                    </label>

                    <label className="settings-toggle-row">
                      <div className="settings-toggle-info">
                        <span className="settings-toggle-title">Call Updates</span>
                        <span className="settings-toggle-desc">
                          Summaries, action points and recordings of calls
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={preferences.callUpdates}
                        onChange={() => handleTogglePreference('callUpdates')}
                        className="toggle-checkbox"
                      />
                    </label>

                    <label className="settings-toggle-row">
                      <div className="settings-toggle-info">
                        <span className="settings-toggle-title">Mentorship Activity</span>
                        <span className="settings-toggle-desc">
                          Assignments, registrations and approvals
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={preferences.mentorshipActivity}
                        onChange={() => handleTogglePreference('mentorshipActivity')}
                        className="toggle-checkbox"
                      />
                    </label>

                    <label className="settings-toggle-row">
                      <div className="settings-toggle-info">
                        <span className="settings-toggle-title">System Announcements</span>
                        <span className="settings-toggle-desc">
                          Important platform updates and notices
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={preferences.systemNotifications}
                        onChange={() => handleTogglePreference('systemNotifications')}
                        className="toggle-checkbox"
                      />
                    </label>
                  </div>
                </div>

                {/* Install App Link */}
                <div className="notification-settings-section border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    For the most reliable notification alerts, install Anfaal on your home screen.
                  </p>
                  <InstallAppButton variant="secondary" />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
