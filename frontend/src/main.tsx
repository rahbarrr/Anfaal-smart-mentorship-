import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import './index.css';
import App from './App.tsx';
import { registerServiceWorker } from './pwa/pwaNotifications.ts';

// Guarantee Service Worker registration for PWA and background Web Push listeners
void registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
