import { createContext } from 'react';
import type { InstallModalPlatform } from './PwaInstallModal';

export interface PwaContextValue {
  isInstalled: boolean;
  canInstallNatively: boolean;
  platform: InstallModalPlatform;
  triggerInstall: () => Promise<void>;
  openInstructions: () => void;
}

export const PwaContext = createContext<PwaContextValue | null>(null);
