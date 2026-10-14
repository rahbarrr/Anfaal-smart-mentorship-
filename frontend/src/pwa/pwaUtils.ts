import type { InstallModalPlatform } from './PwaInstallModal';

export function detectPwaPlatform(): InstallModalPlatform {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIos) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

export function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
