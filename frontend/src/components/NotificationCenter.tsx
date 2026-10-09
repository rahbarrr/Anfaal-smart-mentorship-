import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  getVapidPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
  type InAppNotification,
  type NotificationPreferences,
} from '../lib/api';
import { InstallAppButton } from '../pwa/InstallAppButton';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

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
  const navigate = useNavigate();
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
  const [pushSupported, setPushSupported] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>('default');
  const [pushLoading, setPushLoading] = useState(false);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const getToken = useCallback(() => {
    return localStorage.getItem('anfaal-token') || '';
  }, []);

  // Check Web Push support & initial permission
  useEffect(() => {
    const isSupported =
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window;
    setPushSupported(isSupported);
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
  }, [getToken]);

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
      const data = await getNotifications(token, false, 40);
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen, loadNotifications]);

  // Load preferences when settings view is active
  useEffect(() => {
    if (isOpen && view === 'settings') {
      const token = getToken();
      if (!token) return;
      getNotificationPreferences(token)
        .then((res) => {
          if (res?.preferences) setPreferences(res.preferences);
        })
        .catch(() => undefined);
    }
  }, [isOpen, view, getToken]);

  // Outside click & ESC listeners for closing popover
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (notification: InAppNotification) => {
    const token = getToken();
    if (!notification.read && token) {
      try {
        await markNotificationAsRead(token, notification.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch (err) {
        console.error('Failed to mark read:', err);
      }
    }

    if (notification.link) {
      setIsOpen(false);
      navigate(notification.link);
    }
  };

  const handleMarkAllRead = async () => {
    const token = getToken();
    if (!token || unreadCount === 0) return;
    try {
      await markAllNotificationsAsRead(token);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  // Push Permission & Subscription workflow
  const handleEnablePush = async () => {
    if (!pushSupported) {
      setPushStatusMessage('Push notifications are not supported on this browser or platform.');
      return;
    }

    setPushLoading(true);
    setPushStatusMessage(null);

    try {
      const perm = await Notification.requestPermission();
      setBrowserPermission(perm);

      if (perm !== 'granted') {
        setPushStatusMessage('Notifications permission was declined or blocked.');
        setPushLoading(false);
        return;
      }

      // Get VAPID public key
      const { publicKey } = await getVapidPublicKey();
      if (!publicKey) {
        throw new Error('VAPID public key unavailable');
      }

      const swReg = await navigator.serviceWorker.ready;
      let subscription = await swReg.pushManager.getSubscription();

      if (!subscription) {
        subscription = await swReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
        });
      }

      const token = getToken();
      if (token && subscription) {
        await registerPushSubscription(token, subscription);
        await updateNotificationPreferences(token, { pushEnabled: true });
        setPreferences((p) => ({ ...p, pushEnabled: true }));
        setPushStatusMessage('Push notifications successfully enabled!');
      }
    } catch (err: any) {
      console.error('Push registration error:', err);
      setPushStatusMessage(err?.message || 'Failed to enable push notifications');
    } finally {
      setPushLoading(false);
    }
  };

  const handleDisablePush = async () => {
    setPushLoading(true);
    setPushStatusMessage(null);
    try {
      const swReg = await navigator.serviceWorker.ready;
      const subscription = await swReg.pushManager.getSubscription();
      const token = getToken();
      if (subscription) {
        await subscription.unsubscribe();
        if (token) {
          await unregisterPushSubscription(token, subscription.endpoint);
        }
      }
      if (token) {
        await updateNotificationPreferences(token, { pushEnabled: false });
      }
      setPreferences((p) => ({ ...p, pushEnabled: false }));
      setPushStatusMessage('Push notifications turned off.');
    } catch (err: any) {
      console.error('Push unregister error:', err);
      setPushStatusMessage('Failed to disable push notifications');
    } finally {
      setPushLoading(false);
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
                  className="notification-header-icon-btn notification-close-btn"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close notifications"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* View: Notification List */}
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
                    Unread ({unreadCount})
                  </button>
                </div>

                {/* Notifications Scroll Body */}
                <div className="notification-list-body">
                  {loading && notifications.length === 0 ? (
                    <div className="notification-empty-state">
                      <div className="notification-spinner" />
                      <span>Loading notifications…</span>
                    </div>
                  ) : filteredNotifications.length === 0 ? (
                    <div className="notification-empty-state">
                      <div className="notification-empty-icon">
                        <Bell size={24} />
                      </div>
                      <p className="font-semibold text-gray-800">
                        {activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        We'll alert you here when there are call updates, mentor responses, or important events.
                      </p>
                    </div>
                  ) : (
                    <div className="notification-items">
                      {filteredNotifications.map((item) => (
                        <div
                          key={item.id}
                          className={`notification-card ${!item.read ? 'is-unread' : 'is-read'}`}
                          onClick={() => handleMarkAsRead(item)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleMarkAsRead(item);
                            }
                          }}
                        >
                          <div className="notification-card-icon">
                            {getNotificationIcon(item.type)}
                          </div>
                          <div className="notification-card-content">
                            <div className="notification-card-head">
                              <span className={`notification-card-title ${!item.read ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                                {item.title}
                              </span>
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
                      <h4 className="font-semibold text-sm text-gray-900">Web Push Notifications</h4>
                      <p className="text-xs text-gray-500">
                        Receive instant alerts on this device for important mentorship activity.
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
                      <p className="text-xs text-gray-600 mb-2">
                        Get notified when your mentor uploads a call summary, when a mentee submits a daily response, or when call processing completes.
                      </p>
                      {preferences.pushEnabled && browserPermission === 'granted' ? (
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                            ✓ Push Active on this device
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
                          {pushLoading ? 'Enabling…' : 'Enable Push Notifications'}
                        </button>
                      )}
                    </div>
                  )}

                  {pushStatusMessage && (
                    <p className="text-xs text-primary font-medium mt-1">
                      {pushStatusMessage}
                    </p>
                  )}
                </div>

                {/* Categories Section */}
                <div className="notification-settings-section">
                  <h4 className="font-semibold text-sm text-gray-900 mb-2">
                    Notification Categories
                  </h4>
                  <div className="settings-toggle-list">
                    <label className="settings-toggle-row">
                      <div className="settings-toggle-info">
                        <span className="settings-toggle-label">Call updates & summaries</span>
                        <span className="settings-toggle-desc">Processing complete, summary & transcript available</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={preferences.callUpdates}
                        onChange={() => handleTogglePreference('callUpdates')}
                        className="settings-checkbox"
                      />
                    </label>

                    <label className="settings-toggle-row">
                      <div className="settings-toggle-info">
                        <span className="settings-toggle-label">Daily progress & habits</span>
                        <span className="settings-toggle-desc">Reminders, daily submissions & goal logs</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={preferences.dailyReminders}
                        onChange={() => handleTogglePreference('dailyReminders')}
                        className="settings-checkbox"
                      />
                    </label>

                    <label className="settings-toggle-row">
                      <div className="settings-toggle-info">
                        <span className="settings-toggle-label">Mentorship activity</span>
                        <span className="settings-toggle-desc">New pairings, approvals & mentor updates</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={preferences.mentorshipActivity}
                        onChange={() => handleTogglePreference('mentorshipActivity')}
                        className="settings-checkbox"
                      />
                    </label>

                    <label className="settings-toggle-row">
                      <div className="settings-toggle-info">
                        <span className="settings-toggle-label">System announcements</span>
                        <span className="settings-toggle-desc">Platform alerts and administrative updates</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={preferences.systemNotifications}
                        onChange={() => handleTogglePreference('systemNotifications')}
                        className="settings-checkbox"
                      />
                    </label>
                  </div>
                </div>

                {/* Application Section */}
                <div className="notification-settings-section" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <h4 className="font-semibold text-sm text-gray-900 mb-2">
                    Application & Offline
                  </h4>
                  <InstallAppButton
                    variant="card"
                    onAfterClick={() => setIsOpen(false)}
                    style={{ margin: 0 }}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
