import React from 'react';
import { Download, CheckCircle2 } from 'lucide-react';
import { usePwaInstall } from './PwaContext';

export interface InstallAppButtonProps {
  variant?: 'sidebar' | 'card' | 'inline';
  className?: string;
  style?: React.CSSProperties;
  onAfterClick?: () => void;
}

export function InstallAppButton({
  variant = 'sidebar',
  className = '',
  style = {},
  onAfterClick,
}: InstallAppButtonProps) {
  const { isInstalled, triggerInstall } = usePwaInstall();

  const handleClick = async () => {
    await triggerInstall();
    if (onAfterClick) {
      onAfterClick();
    }
  };

  if (variant === 'card') {
    return (
      <div
        className={`form-card ${className}`}
        style={{
          padding: 16,
          borderRadius: 14,
          border: isInstalled ? '1px solid rgba(46, 139, 87, 0.25)' : '1px solid var(--border)',
          background: isInstalled ? 'rgba(46, 139, 87, 0.03)' : 'var(--surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          ...style,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: isInstalled ? 'rgba(46, 139, 87, 0.1)' : 'rgba(143,63,102,0.08)',
              color: isInstalled ? '#2e7d32' : 'var(--primary)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            {isInstalled ? <CheckCircle2 size={20} /> : <Download size={20} />}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', color: isInstalled ? '#2e7d32' : 'var(--text-primary)' }}>
              {isInstalled ? 'Anfaal is Installed' : 'Install Anfaal App'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {isInstalled
                ? 'App is active on your device'
                : 'Fast offline access & home screen launcher'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClick}
          className={isInstalled ? 'btn-secondary' : 'btn-primary'}
          style={{
            height: 38,
            padding: '0 14px',
            fontSize: '0.84rem',
            fontWeight: 700,
            borderRadius: 10,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {isInstalled ? <CheckCircle2 size={15} /> : <Download size={15} />}
          <span>{isInstalled ? 'View App Status' : 'Install Anfaal'}</span>
        </button>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`btn-secondary ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.86rem',
          fontWeight: 600,
          ...style,
        }}
        title={isInstalled ? 'Anfaal is installed on this device' : 'Install Anfaal app'}
      >
        {isInstalled ? <CheckCircle2 size={16} color="#2e7d32" /> : <Download size={16} color="var(--primary)" />}
        <span>{isInstalled ? 'App Installed' : 'Install Anfaal'}</span>
      </button>
    );
  }

  // Default: sidebar variant
  return (
    <button
      type="button"
      id="desktop-sidebar-install-btn"
      onClick={handleClick}
      className={`btn-secondary ${className}`}
      style={{
        width: '100%',
        minHeight: 40,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 8,
        fontSize: '0.85rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        borderColor: isInstalled ? 'rgba(46, 139, 87, 0.3)' : 'var(--border)',
        color: isInstalled ? '#2e7d32' : 'var(--text-primary)',
        background: isInstalled ? 'rgba(46, 139, 87, 0.05)' : 'var(--surface)',
        transition: 'all 0.15s ease',
        ...style,
      }}
      title={isInstalled ? 'Anfaal is already installed on this device' : 'Install Anfaal application'}
      aria-label={isInstalled ? 'Anfaal is already installed' : 'Install Anfaal App'}
    >
      {isInstalled ? <CheckCircle2 size={16} color="#2e7d32" /> : <Download size={16} color="var(--primary)" />}
      <span>{isInstalled ? 'App Installed' : 'Install Anfaal'}</span>
    </button>
  );
}
