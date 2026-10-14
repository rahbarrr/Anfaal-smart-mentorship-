import { useContext } from 'react';
import { checkIsStandalone, detectPwaPlatform } from './pwaUtils';
import { PwaContext, type PwaContextValue } from './PwaContextStore';

export function usePwaInstall(): PwaContextValue {
  const context = useContext(PwaContext);
  if (!context) {
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
