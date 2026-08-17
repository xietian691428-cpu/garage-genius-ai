"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthGate from "@/components/auth/AuthGate";
import Sidebar from "@/components/layout/Sidebar";
import MobileTabBar from "@/components/layout/MobileTabBar";
import Dashboard from "@/components/dashboard/Dashboard";
import ChatApp from "@/components/chat/ChatApp";
import CoachLibrary from "@/components/coach/CoachLibrary";
import MaintenanceHistory from "@/components/history/MaintenanceHistory";
import PartsInventory from "@/components/parts/PartsInventory";
import SettingsPanel from "@/components/settings/SettingsPanel";
import type { FocusCommand } from "@/lib/types/focus";
import { TrialEndedModal } from "@/components/subscription/TrialBanners";
import { useSubscription } from "@/hooks/useSubscription";
import { useVehicles } from "@/hooks/useVehicles";
import { useBrowserChromeInset } from "@/hooks/useBrowserChromeInset";
import QaModeBanner from "@/components/qa/QaModeBanner";
import VerifyEmailBanner from "@/components/auth/VerifyEmailBanner";
import { TokenUsageProvider } from "@/hooks/useTokenUsage";
import { isQaUnlockEnabled } from "@/lib/qa-mode";
import { isNativeCapacitor } from "@/lib/native-platform";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import type { VehicleInfo } from "@/lib/types/chat";
import {
  assertCoachProductionReady,
  logAppModuleMount,
} from "@/lib/bootstrap/app-modules";
import WelcomeNoteModal from "@/components/welcome/WelcomeNoteModal";
import { useWelcomeNote } from "@/hooks/useWelcomeNote";
import { AiConsentProvider } from "@/components/legal/AiConsentProvider";

type AppTab = "dashboard" | "chat" | "coach" | "history" | "parts" | "settings";

const VALID_TABS = new Set<AppTab>([
  "dashboard",
  "chat",
  "coach",
  "history",
  "parts",
  "settings",
]);

/** Assert 27 *_production.json + safety UX rules when the garage module loads. */
try {
  logAppModuleMount(assertCoachProductionReady());
} catch (err) {
  console.error(err);
}

function parseAppTab(value: string | null): AppTab {
  if (value && VALID_TABS.has(value as AppTab)) return value as AppTab;
  return "dashboard";
}

function GarageAppInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseAppTab(searchParams.get("tab"));
  const [chatSeedPrompt, setChatSeedPrompt] = useState("");
  const [chatSeedImages, setChatSeedImages] = useState<string[]>([]);
  const [chatPlaybookSlug, setChatPlaybookSlug] = useState<string | null>(null);
  const [coachPlaybookSlug, setCoachPlaybookSlug] = useState<string | null>(
    null,
  );
  const [focusCommand, setFocusCommand] = useState<FocusCommand | null>(null);
  const { showTrialEndedPrompt, dismissTrialEndedPrompt } = useSubscription();
  const {
    vehicles,
    currentVehicle,
    loading: vehiclesLoading,
    error: vehiclesError,
    refresh: refreshVehicles,
    selectVehicle,
    addVehicle,
    updateVehicle,
    mergeVehicleLocal,
    archiveVehicle,
    removeVehicle,
  } = useVehicles();
  const [garageErrorDismissed, setGarageErrorDismissed] = useState(false);

  // Mobile Safari: lift bottom chrome; native Capacitor keeps iOS-style bottom tabs.
  useBrowserChromeInset();
  const [mobileNavPlacement, setMobileNavPlacement] = useState<"top" | "bottom">(
    "top",
  );
  useEffect(() => {
    setMobileNavPlacement(isNativeCapacitor() ? "bottom" : "top");
  }, []);

  const setAppTab = useCallback(
    (tab: AppTab) => {
      const next = new URLSearchParams(searchParams.toString());
      if (tab === "dashboard") next.delete("tab");
      else next.set("tab", tab);
      const qs = next.toString();
      router.replace(qs ? `/app?${qs}` : "/app", { scroll: false });
    },
    [router, searchParams],
  );

  const handleAskAI = (
    prompt: string,
    options?: { images?: string[]; playbookSlug?: string },
  ) => {
    setChatSeedPrompt(prompt);
    setChatSeedImages(options?.images?.filter(Boolean) ?? []);
    setChatPlaybookSlug(options?.playbookSlug ?? null);
    setAppTab("chat");
  };

  const handleTabChange = (tab: string) => {
    setAppTab(parseAppTab(tab));
  };

  const handleFocusFromChat = useCallback(
    (command: FocusCommand) => {
      setFocusCommand(command);
      setAppTab("dashboard");
    },
    [setAppTab],
  );

  const handleFocusConsumed = useCallback(() => {
    setFocusCommand(null);
  }, []);

  const handleOnboardingComplete = useCallback(
    async (vehicle: VehicleInfo) => {
      await addVehicle(vehicle);
      setAppTab("dashboard");
      return vehicle;
    },
    [addVehicle, setAppTab],
  );

  const needsOnboarding =
    !vehiclesLoading &&
    (!vehiclesError || garageErrorDismissed) &&
    vehicles.length === 0 &&
    !currentVehicle;

  const showGarageError =
    !vehiclesLoading && Boolean(vehiclesError) && !garageErrorDismissed;

  const showMainShell =
    !vehiclesLoading && !showGarageError && !needsOnboarding;

  const trialModalOpen = showTrialEndedPrompt && !isQaUnlockEnabled();

  const { open: welcomeNoteOpen, dismiss: dismissWelcomeNote } = useWelcomeNote({
    // After first login lands on the real app shell — not login, loading, or onboarding
    enabled: showMainShell && !trialModalOpen,
  });

  return (
    <AuthGate>
      <TokenUsageProvider>
        <AiConsentProvider>
      <TrialEndedModal
        open={trialModalOpen}
        onClose={dismissTrialEndedPrompt}
      />
      <WelcomeNoteModal
        open={welcomeNoteOpen}
        onDismiss={() => void dismissWelcomeNote()}
      />
      <QaModeBanner />
      <VerifyEmailBanner />

      {vehiclesLoading && (
        <div
          data-testid="garage-loading"
          className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#0a0f1c] px-6 text-center text-slate-400"
          role="status"
        >
          <p>Loading your garage…</p>
          <p className="text-xs text-slate-600">
            This usually takes a few seconds.
          </p>
        </div>
      )}

      {showGarageError && (
        <div
          data-testid="garage-load-error"
          className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0a0f1c] px-6 text-center"
          role="alert"
        >
          <p className="max-w-md text-sm text-amber-100">
            {vehiclesError}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              data-testid="garage-retry"
              onClick={() => {
                setGarageErrorDismissed(false);
                void refreshVehicles();
              }}
              className="min-h-[48px] rounded-2xl bg-cyan-500 px-5 text-sm font-semibold text-black hover:bg-cyan-400"
            >
              Try again
            </button>
            <button
              type="button"
              data-testid="garage-continue"
              onClick={() => setGarageErrorDismissed(true)}
              className="min-h-[48px] rounded-2xl border border-slate-600 px-5 text-sm font-medium text-slate-200 hover:border-cyan-500/40"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {!vehiclesLoading && !showGarageError && needsOnboarding && (
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      )}

      {!vehiclesLoading && !showGarageError && !needsOnboarding && (
        <div className="app-shell flex overflow-hidden">
          <div className="hidden lg:block">
            <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 pt-[max(0.35rem,env(safe-area-inset-top))] lg:hidden">
              {mobileNavPlacement === "top" && (
                <MobileTabBar
                  activeTab={activeTab}
                  onTabChange={handleTabChange}
                  placement="top"
                />
              )}
              {mobileNavPlacement === "bottom" && (
                <header className="flex items-center gap-2 border-b border-slate-800 bg-[#0a0f1c] px-4 py-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500">
                    <span className="text-sm font-bold text-black">G</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      Garage Genius
                    </p>
                    <p className="truncate text-[10px] text-cyan-400">
                      AI Auto Assistant
                    </p>
                  </div>
                </header>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {activeTab === "dashboard" && (
                <Dashboard
                  onAskAI={handleAskAI}
                  focusCommand={focusCommand}
                  onFocusConsumed={handleFocusConsumed}
                  vehicles={vehicles}
                  currentVehicle={currentVehicle}
                  vehiclesLoading={vehiclesLoading}
                  onVehicleChange={selectVehicle}
                  onAddVehicle={addVehicle}
                  onUpdateVehicle={updateVehicle}
                  onMergeVehicleLocal={mergeVehicleLocal}
                  onOpenSettings={() => setAppTab("settings")}
                  onOpenChat={() => setAppTab("chat")}
                  onOpenHistory={() => setAppTab("history")}
                  onOpenCoach={(slug) => {
                    setCoachPlaybookSlug(slug ?? null);
                    setAppTab("coach");
                  }}
                />
              )}

              {activeTab === "chat" && (
                <ChatApp
                  seedPrompt={chatSeedPrompt}
                  seedImages={chatSeedImages}
                  playbookSlug={chatPlaybookSlug}
                  onPromptUsed={() => {
                    setChatSeedPrompt("");
                    setChatSeedImages([]);
                    setChatPlaybookSlug(null);
                  }}
                  onGoToInventory={() => setAppTab("parts")}
                  onFocusDetected={handleFocusFromChat}
                  vehicles={vehicles}
                  currentVehicle={currentVehicle}
                  vehiclesLoading={vehiclesLoading}
                  onVehicleChange={selectVehicle}
                  onAddVehicle={addVehicle}
                  onUpdateVehicle={updateVehicle}
                  onMergeVehicleLocal={mergeVehicleLocal}
                  onArchiveVehicle={async (v) => {
                    await archiveVehicle(v.id);
                  }}
                  onRemoveVehicle={async (v) => {
                    await removeVehicle(v.id);
                  }}
                />
              )}

              {activeTab === "coach" && (
                <CoachLibrary
                  currentVehicle={currentVehicle}
                  onAskAI={(prompt, opts) =>
                    handleAskAI(prompt, {
                      playbookSlug: opts?.playbookSlug,
                      images: opts?.images,
                    })
                  }
                  onGoToParts={() => setAppTab("parts")}
                  onMergeVehicleLocal={mergeVehicleLocal}
                  initialPlaybookSlug={coachPlaybookSlug}
                  onInitialPlaybookConsumed={() => setCoachPlaybookSlug(null)}
                />
              )}

              {activeTab === "history" && (
                <MaintenanceHistory
                  vehicles={vehicles}
                  currentVehicle={currentVehicle}
                  vehiclesLoading={vehiclesLoading}
                />
              )}

              {activeTab === "parts" && (
                <PartsInventory
                  vehicles={vehicles}
                  currentVehicle={currentVehicle}
                  vehiclesLoading={vehiclesLoading}
                  onVehicleChange={selectVehicle}
                />
              )}

              {activeTab === "settings" && (
                <SettingsPanel
                  currentVehicle={currentVehicle}
                  vehiclesLoading={vehiclesLoading}
                  onUpdateVehicle={updateVehicle}
                />
              )}
            </div>

            {mobileNavPlacement === "bottom" && (
              <MobileTabBar
                activeTab={activeTab}
                onTabChange={handleTabChange}
                placement="bottom"
              />
            )}
          </div>
        </div>
      )}
        </AiConsentProvider>
      </TokenUsageProvider>
    </AuthGate>
  );
}

export default function GarageAppPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0a0f1c] text-slate-400">
          Loading…
        </div>
      }
    >
      <GarageAppInner />
    </Suspense>
  );
}
