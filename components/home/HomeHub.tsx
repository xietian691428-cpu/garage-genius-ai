"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VehicleInfo } from "@/lib/types/chat";
import type { VehicleVitals } from "@/lib/vehicle-vitals";
import { maintenanceService } from "@/lib/maintenance-records";
import { evaluatePredictiveMaintenance } from "@/lib/predictive-maintenance/engine";
import type { PredictiveMaintenanceCard } from "@/lib/predictive-maintenance/engine";
import { snoozePredictiveItem } from "@/lib/predictive-maintenance/snooze";
import {
  buildHealthSnapshot,
  buildNextRecommendedAction,
  type HomeActionId,
} from "@/lib/home-health";
import { shouldShowObdConnectEntry } from "@/lib/obd-preference";
import { useObdPreference } from "@/hooks/useObdPreference";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/lib/supabase";
import { chatCloudService } from "@/lib/chat-cloud";
import { extractDtcCodes } from "@/lib/dtc";
import {
  EMPTY_GARAGE_DIY_HEADLINE,
  EMPTY_GARAGE_DIY_STEPS,
  getUsHighFreqDtcChips,
} from "@/lib/us-completion-funnel";
import HomeTopBar from "@/components/home/HomeTopBar";
import VehicleHealthSnapshot from "@/components/home/VehicleHealthSnapshot";
import NextRecommendedAction from "@/components/home/NextRecommendedAction";
import QuickActionsRow from "@/components/home/QuickActionsRow";
import UpcomingMaintenanceSection from "@/components/home/UpcomingMaintenanceSection";
import RecentActivitySection, {
  type RecentActivityItem,
} from "@/components/home/RecentActivitySection";
import HomeTrustStrip from "@/components/home/HomeTrustStrip";
import DtcCodeModal from "@/components/chat/DtcCodeModal";
import ShopReportModal from "@/components/shop-report/ShopReportModal";
import { formatAppDate, formatAppNumber } from "@/lib/format-app-date";

type Props = {
  vehicles: VehicleInfo[];
  vehicle: VehicleInfo | null;
  vehiclesLoading?: boolean;
  vitals: VehicleVitals | null;
  onVehicleChange: (v: VehicleInfo) => void | Promise<void>;
  onAskAI?: (prompt: string, options?: { images?: string[]; playbookSlug?: string }) => void;
  onOpenSettings: () => void;
  onOpenCoach: (slug?: string) => void;
  onOpenChat: () => void;
  onOpenHistory: () => void;
  onPhotoDiagnose: () => void;
  onConnectObd: () => void;
};

function unfinishedHintFromMessages(
  messages: { role: string; content: string }[],
): string | null {
  const recent = messages.slice(-8);
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (m.role !== "user") continue;
    const codes = extractDtcCodes(m.content || "");
    if (codes[0]) return codes[0];
    const rough = m.content.match(
      /\b(rough idle|check engine|misfire|noise|vibration|smell)\b/i,
    );
    if (rough) return rough[1];
  }
  return null;
}

export default function HomeHub({
  vehicles,
  vehicle,
  vehiclesLoading,
  vitals,
  onVehicleChange,
  onAskAI,
  onOpenSettings,
  onOpenCoach,
  onOpenChat,
  onOpenHistory,
  onPhotoDiagnose,
  onConnectObd,
}: Props) {
  const { isPro } = useSubscription();
  const { pref: obdPref } = useObdPreference();
  const showObd = shouldShowObdConnectEntry(obdPref);
  const [predictive, setPredictive] = useState<PredictiveMaintenanceCard[]>([]);
  const [unfinishedHint, setUnfinishedHint] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentActivityItem[]>([]);
  const [dtcOpen, setDtcOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const maintRef = useRef<HTMLElement | null>(null);

  const refreshPredictive = useCallback(async () => {
    if (!vehicle) {
      setPredictive([]);
      return;
    }
    try {
      const { records } = await maintenanceService.list({
        vehicleId: vehicle.id,
        isPro,
      });
      setPredictive(
        evaluatePredictiveMaintenance({ vehicle, records, maxItems: 3 }),
      );
    } catch {
      setPredictive(evaluatePredictiveMaintenance({ vehicle, records: [] }));
    }
  }, [vehicle, isPro]);

  useEffect(() => {
    void refreshPredictive();
  }, [refreshPredictive]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!vehicle?.id) {
      setUnfinishedHint(null);
      setRecent([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const msgs = await chatCloudService.load(vehicle.id, { isPro });
        if (cancelled) return;
        const list = (msgs || [])
          .filter((m) => m.id !== "welcome")
          .map((m) => ({ role: m.role, content: m.content }));
        setUnfinishedHint(unfinishedHintFromMessages(list));
      } catch {
        if (!cancelled) setUnfinishedHint(null);
      }

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(
          `/api/shop-report/list?vehicleId=${encodeURIComponent(vehicle.id)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          reports?: Array<{
            id: string;
            reportCode: string;
            createdAt: string;
            codes: string[];
          }>;
        };
        const items: RecentActivityItem[] = (data.reports || [])
          .slice(0, 3)
          .map((r) => ({
            id: r.id,
            label: `Shop Report #${r.reportCode}`,
            detail: `${formatAppDate(r.createdAt)}${
              r.codes?.length ? ` · ${r.codes.slice(0, 2).join(", ")}` : ""
            }`,
            onClick: () => setShopOpen(true),
          }));
        if (vehicle.mileage) {
          items.push({
            id: "mileage",
            label: "Mileage on file",
            detail: `${formatAppNumber(Number(vehicle.mileage))} mi`,
          });
        }
        if (!cancelled) setRecent(items.slice(0, 3));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vehicle?.id, vehicle?.mileage, isPro]);

  const health = useMemo(() => {
    if (!vehicle) return null;
    return buildHealthSnapshot({ vehicle, vitals, predictive });
  }, [vehicle, vitals, predictive]);

  const nextAction = useMemo(() => {
    if (!vehicle) return null;
    return buildNextRecommendedAction({
      vehicle,
      vitals,
      predictive,
      unfinishedDiagnosisHint: unfinishedHint,
    });
  }, [vehicle, vitals, predictive, unfinishedHint]);

  const shopMessages = useMemo(() => {
    const codes = vitals?.codes || [];
    if (!codes.length && !unfinishedHint) {
      return [
        {
          role: "user" as const,
          content:
            "Owner check-in: please help summarize recent symptoms for a shop handoff. Education only.",
        },
      ];
    }
    const codeLine = codes.map((c) => `${c.code} (${c.desc})`).join("; ");
    return [
      {
        role: "user" as const,
        content: `Open diagnostic notes: ${codeLine || unfinishedHint || "symptoms under review"}. Please prepare an educational shop handoff summary.`,
      },
    ];
  }, [vitals?.codes, unfinishedHint]);

  const runAction = (action: HomeActionId, extra?: PredictiveMaintenanceCard) => {
    if (!vehicle) {
      onOpenChat();
      return;
    }
    switch (action) {
      case "continue_diagnosis":
      case "finish_diagnosis": {
        const codes = vitals?.codes || [];
        const codeHint =
          codes[0]?.code || unfinishedHint || "open symptoms";
        const prompt =
          nextAction?.primary.prompt ||
          `Continue diagnosing ${codeHint} on my ${vehicle.year} ${vehicle.make} ${vehicle.model}. Keep an educational tone and avoid root-cause assertions.`;
        if (onAskAI) onAskAI(prompt, { playbookSlug: "diagnosis_check_engine" });
        else onOpenChat();
        break;
      }
      case "start_checkin":
      case "describe_symptom":
      case "open_chat":
        if (nextAction?.primary.prompt && onAskAI) {
          onAskAI(nextAction.primary.prompt);
        } else {
          onOpenChat();
        }
        break;
      case "shop_report":
      case "export_shop_report":
        setShopOpen(true);
        break;
      case "view_maintenance":
        maintRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      case "predictive_howto":
        if (extra?.coachSlug) onOpenCoach(extra.coachSlug);
        else if (extra?.howToPrompt && onAskAI) onAskAI(extra.howToPrompt);
        else onOpenCoach();
        break;
      case "open_coach":
        onOpenCoach(extra?.coachSlug);
        break;
      case "enter_code":
        setDtcOpen(true);
        break;
      case "upload_photo":
        onPhotoDiagnose();
        break;
      case "connect_obd":
        onConnectObd();
        break;
      case "obd_settings":
        onOpenSettings();
        break;
      default:
        onOpenChat();
    }
  };

  if (!vehicle) {
    return (
      <div className="space-y-4" data-testid="home-hub-empty">
        <HomeTopBar
          vehicles={vehicles}
          current={null}
          loading={vehiclesLoading}
          onVehicleChange={(v) => void onVehicleChange(v)}
        />
        <div className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
          <p className="text-sm leading-relaxed text-slate-200">
            {EMPTY_GARAGE_DIY_HEADLINE}
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-snug text-slate-400">
            {EMPTY_GARAGE_DIY_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <button
            type="button"
            data-testid="home-empty-open-chat"
            onClick={onOpenChat}
            className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-cyan-500 px-4 text-sm font-semibold text-black hover:bg-cyan-400"
          >
            Open Chat to add this car
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="home-hub">
      <HomeTopBar
        vehicles={vehicles}
        current={vehicle}
        loading={vehiclesLoading}
        onVehicleChange={(v) => void onVehicleChange(v)}
      />

      {toast ? (
        <p
          className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-center text-xs text-cyan-100"
          role="status"
        >
          {toast}
        </p>
      ) : null}

      {health ? (
        <VehicleHealthSnapshot
          snapshot={health}
          onPrimary={() => runAction(health.primaryCta.action)}
        />
      ) : null}

      {nextAction ? (
        <NextRecommendedAction
          action={nextAction}
          onPrimary={() => {
            const card = predictive.find(
              (p) => p.key === nextAction.primary.itemKey,
            );
            runAction(nextAction.primary.action, card);
          }}
          onSecondary={() => {
            maintRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
            onOpenCoach();
          }}
        />
      ) : null}

      <QuickActionsRow
        showObdConnect={showObd}
        onStartChat={onOpenChat}
        onEnterCode={() => setDtcOpen(true)}
        onUploadPhoto={onPhotoDiagnose}
        onConnectObd={onConnectObd}
        onObdSettings={onOpenSettings}
      />

      <section data-testid="home-us-code-chips">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Common US codes
        </h3>
        <p className="mb-2 text-xs leading-snug text-slate-500">
          Already mapped to a Coach guide — tap to start an educational check-in.
        </p>
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
          {getUsHighFreqDtcChips().map((chip) => (
            <button
              key={chip.code}
              type="button"
              data-testid={`home-dtc-${chip.code}`}
              onClick={() =>
                onAskAI?.(chip.prompt, { playbookSlug: chip.playbookSlug })
              }
              className="min-h-[52px] min-w-[7.5rem] shrink-0 rounded-2xl border border-slate-700 bg-[#111827] px-3 py-2 text-left text-xs font-semibold text-slate-100 hover:border-cyan-500/40 hover:text-cyan-200"
            >
              {chip.code}
              <span className="mt-0.5 block font-normal text-slate-500">
                {chip.hint.split(/[.(]/)[0]}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div
        ref={(el) => {
          maintRef.current = el;
        }}
      >
        <UpcomingMaintenanceSection
          items={predictive}
          onHowTo={(item) => {
            if (item.coachSlug) onOpenCoach(item.coachSlug);
            else if (onAskAI) onAskAI(item.howToPrompt);
          }}
          onRemindLater={(item) => {
            snoozePredictiveItem(vehicle.id, item.key, vehicle.mileage || 0);
            setToast("Reminder snoozed for ~30 days / 1,000 mi");
            void refreshPredictive();
          }}
          onMarkDone={(item) => {
            void (async () => {
              try {
                await maintenanceService.create({
                  vehicleId: vehicle.id,
                  title: item.title,
                  category:
                    item.key === "engine_oil"
                      ? "oil"
                      : item.key.includes("filter")
                        ? "filter"
                        : item.key.includes("brake")
                          ? "brakes"
                          : item.key.includes("tire")
                            ? "tires"
                            : "general",
                  mileage: vehicle.mileage || undefined,
                  performedAt: new Date().toISOString().slice(0, 10),
                  source: "manual",
                  notes: "Marked done from Home predictive card",
                });
                setToast("Logged — thanks for keeping history updated");
                void refreshPredictive();
                onOpenHistory();
              } catch (err) {
                setToast(
                  err instanceof Error ? err.message : "Could not save record",
                );
              }
            })();
          }}
        />
      </div>

      <RecentActivitySection items={recent} />
      <HomeTrustStrip />

      <DtcCodeModal
        open={dtcOpen}
        onClose={() => setDtcOpen(false)}
        onSubmit={(code) => {
          setDtcOpen(false);
          onAskAI?.(
            `I have fault code ${code} on my ${vehicle.year} ${vehicle.make} ${vehicle.model}. Confirm the code, give top likely causes with DIY checks first, and keep an educational tone.`,
            { playbookSlug: "diagnosis_check_engine" },
          );
        }}
      />

      <ShopReportModal
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        source="chat"
        vehicle={vehicle}
        messages={shopMessages}
      />
    </div>
  );
}
