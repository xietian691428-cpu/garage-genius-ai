"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useAiConsent } from "@/hooks/useAiConsent";
import AiProviderConsentModal from "@/components/legal/AiProviderConsentModal";

type AiConsentContextValue = {
  loaded: boolean;
  acknowledged: boolean;
  ensureConsent: () => Promise<boolean>;
};

const AiConsentContext = createContext<AiConsentContextValue | null>(null);

export function AiConsentProvider({ children }: { children: ReactNode }) {
  const consent = useAiConsent();

  const value = useMemo(
    () => ({
      loaded: consent.loaded,
      acknowledged: consent.acknowledged,
      ensureConsent: consent.ensureConsent,
    }),
    [consent.loaded, consent.acknowledged, consent.ensureConsent],
  );

  return (
    <AiConsentContext.Provider value={value}>
      {children}
      <AiProviderConsentModal
        open={consent.showModal}
        onAgree={() => void consent.acknowledge()}
        onDecline={consent.decline}
      />
    </AiConsentContext.Provider>
  );
}

export function useAiConsentGate(): AiConsentContextValue {
  const ctx = useContext(AiConsentContext);
  const fallbackEnsure = useCallback(async () => true, []);
  if (!ctx) {
    return {
      loaded: true,
      acknowledged: true,
      ensureConsent: fallbackEnsure,
    };
  }
  return ctx;
}
