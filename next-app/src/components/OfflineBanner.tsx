'use client';

import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export function OfflineBanner() {
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
      }, 3500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!mounted || (isOnline && !showReconnected)) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`offline-banner ${!isOnline ? 'offline-banner--offline' : 'offline-banner--online'}`}
    >
      <div className="offline-banner-content">
        {!isOnline ? (
          <>
            <WifiOff size={16} className="offline-banner-icon" />
            <span>You are offline. Live changes will resume once reconnected.</span>
          </>
        ) : (
          <>
            <Wifi size={16} className="offline-banner-icon" />
            <span>Back online. Connection restored.</span>
          </>
        )}
      </div>
    </div>
  );
}
