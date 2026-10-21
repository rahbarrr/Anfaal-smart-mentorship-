'use client';

import React from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { PwaProvider } from '@/pwa/PwaContext';
import { PwaPrompts } from '@/pwa/PwaPrompts';
import { OfflineBanner } from './OfflineBanner';
import { ErrorBoundary } from './ErrorBoundary';

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PwaProvider>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <OfflineBanner />
        <PwaPrompts />
      </PwaProvider>
    </AuthProvider>
  );
}
