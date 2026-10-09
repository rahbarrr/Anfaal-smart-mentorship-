import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { PwaInstallModal, type InstallModalPlatform } from './PwaInstallModal';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaContextValue {
  isInstalled: boolean;
  canInstallNatively: boolean;
  platform: InstallModalPlatform;
  triggerInstall: () => Promise<void>;
  openInstructions: () => void;
}

const PwaContext = createContext<PwaContextValue | null>(null);

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

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => checkIsStandalone());
  const [showModal, setShowModal] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'instructions' | 'already-installed'>('instructions');

  const platform = detectPwaPlatform();

  useEffect(() => {
    // Check standalone on load and listen to media query changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
      }
    };

    if (mediaQuery.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true) {
      setIsInstalled(true);
    }

    mediaQuery.addEventListener('change', handleMediaChange);

    // Capture beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault(); // Prevent automatic browser banner; allow user-initiated install
      setInstallEvent(e as BeforeInstallPromptEvent);
    };

    // Capture appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallEvent(null);
      setShowModal(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (isInstalled || checkIsStandalone()) {
      setIsInstalled(true);
      setModalMode('already-installed');
      setShowModal(true);
      return;
    }

    if (installEvent) {
      try {
        await installEvent.prompt();
        const choice = await installEvent.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setInstallEvent(null);
        }
      } catch {
        // If native prompt threw or was invalidated, display instruction modal
        setModalMode('instructions');
        setShowModal(true);
      }
      return;
    }

    // Native prompt not available (iOS Safari, Firefox, or already dismissed native prompt)
    setModalMode('instructions');
    setShowModal(true);
  }, [installEvent, isInstalled]);

  const openInstructions = useCallback(() => {
    if (isInstalled || checkIsStandalone()) {
      setModalMode('already-installed');
    } else {
      setModalMode('instructions');
    }
    setShowModal(true);
  }, [isInstalled]);

  const value: PwaContextValue = {
    isInstalled,
    canInstallNatively: Boolean(installEvent),
    platform,
    triggerInstall,
    openInstructions,
  };

  return (
    <PwaContext.Provider value={value}>
      {children}
      <PwaInstallModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        mode={modalMode}
        defaultPlatform={platform}
      />
    </PwaContext.Provider>
  );
}

export function usePwaInstall(): PwaContextValue {
  const context = useContext(PwaContext);
  if (!context) {
    // Graceful fallback if called outside provider
    return {
      isInstalled: checkIsStandalone(),
      canInstallNatively: false,
      platform: detectPwaPlatform(),
      triggerInstall: async () => {},
      openInstructions: () => {},
    };
  }
  return context;
}
