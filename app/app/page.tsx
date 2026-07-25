"use client";

import { useCallback, useState, Suspense } from "react";
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
import QaModeBanner from "@/components/qa/QaModeBanner";
import { isQaUnlockEnabled } from "@/lib/qa-mode";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import type { VehicleInfo } from "@/lib/types/chat";
import {
  assertCoachProductionReady,
  logAppModuleMount,
} from "@/lib/bootstrap/app-modules";

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
  const [focusCommand, setFocusCommand] = useState<FocusCommand | null>(null);
  const { showTrialEndedPrompt, dismissTrialEndedPrompt } = useSubscription();
  const {
    vehicles,
    currentVehicle,
    loading: vehiclesLoading,
    selectVehicle,
    addVehicle,
    updateVehicle,
    archiveVehicle,
    removeVehicle,
  } = useVehicles();

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
    !vehiclesLoading && vehicles.length === 0 && !currentVehicle;

  return (
    <AuthGate>
      <TrialEndedModal
        open={showTrialEndedPrompt && !isQaUnlockEnabled()}
        onClose={dismissTrialEndedPrompt}
      />
      <QaModeBanner />

      {vehiclesLoading && (
        <div className="flex min-h-dvh items-center justify-center bg-[#0a0f1c] text-slate-400">
          Loading your garage…
        </div>
      )}

      {!vehiclesLoading && needsOnboarding && (
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      )}

      {!vehiclesLoading && !needsOnboarding && (
        <div className="app-shell flex overflow-hidden">
          <div className="hidden lg:block">
            <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <header className="flex shrink-0 items-center gap-2 border-b border-slate-800 bg-[#0a0f1c] px-4 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] lg:hidden">
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
                    })
                  }
                  onGoToParts={() => setAppTab("parts")}
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

              {activeTab === "settings" && <SettingsPanel />}
            </div>

            <MobileTabBar activeTab={activeTab} onTabChange={handleTabChange} />
          </div>
        </div>
      )}
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
