"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Phone, MapPin, AlertTriangle } from "lucide-react";
import type { TripPackManifest } from "@/lib/offline-trip-pack/types";
import {
  matchOfflineAssistQuery,
  offlineDoNotDriveCopy,
} from "@/lib/offline-trip-pack/match";
import { tripPackFluidSourceLabel } from "@/lib/offline-trip-pack/source-label";
import {
  systemMapSearchUrl,
  telHref,
  straightLineKm,
} from "@/lib/offline-trip-pack/maps-links";
import {
  formatOfflineObdForOnlineChat,
  loadOfflineObdSession,
} from "@/lib/offline-trip-pack/obd-session";
import { isBrowserOnline } from "@/lib/offline-trip-pack/online";
import { getCapacitorPlatform } from "@/lib/native-platform";

type Props = {
  open: boolean;
  onClose: () => void;
  pack: TripPackManifest | null;
  vehicleId: string | null;
  vehicleLabel: string;
  /** Wrong-vehicle guard failed */
  vehicleMismatch?: boolean;
  onOpenFullCoach?: () => void;
  onCarryObdToChat?: (text: string) => void;
};

function platformForMaps(): "ios" | "android" | "web" {
  const p = getCapacitorPlatform();
  if (p === "ios") return "ios";
  if (p === "android") return "android";
  return "web";
}

export default function OfflineAssistPanel({
  open,
  onClose,
  pack,
  vehicleId,
  vehicleLabel,
  vehicleMismatch,
  onOpenFullCoach,
  onCarryObdToChat,
}: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const online = typeof window !== "undefined" ? isBrowserOnline() : true;

  const match = useMemo(
    () => (submitted ? matchOfflineAssistQuery(submitted) : null),
    [submitted],
  );

  const obdSession =
    vehicleId && typeof window !== "undefined"
      ? loadOfflineObdSession(vehicleId)
      : null;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("offlineTripPack.assistTitle")}
      data-testid="offline-assist-panel"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-[#0f172a] sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
              <span className="rounded bg-amber-500/20 px-2 py-0.5">
                {t("offlineTripPack.offlineBadge")}
              </span>
            </p>
            <h2 className="mt-1 text-base font-semibold text-white">
              {t("offlineTripPack.assistTitle")}
            </h2>
            <p className="truncate text-xs text-slate-400">{vehicleLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {vehicleMismatch || !pack ? (
            <div
              className="rounded-2xl border border-amber-700/50 bg-amber-950/40 p-3 text-sm text-amber-100"
              data-testid="offline-assist-no-pack"
            >
              <p className="font-medium">{t("offlineTripPack.noPackTitle")}</p>
              <p className="mt-1 text-xs text-amber-200/90">
                {t("offlineTripPack.noPackBody")}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-slate-400">
                {t("offlineTripPack.assistHint")}
              </p>

              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmitted(query.trim());
                }}
              >
                <input
                  data-testid="offline-assist-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("offlineTripPack.queryPlaceholder")}
                  className="min-h-[44px] flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-3 text-sm text-white placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  data-testid="offline-assist-lookup"
                  className="min-h-[44px] rounded-2xl bg-cyan-500 px-4 text-sm font-semibold text-black"
                >
                  {t("offlineTripPack.lookup")}
                </button>
              </form>

              {match ? (
                <div className="space-y-3" data-testid="offline-assist-result">
                  {match.doNotDrive ? (
                    <div
                      className="rounded-2xl border border-rose-500/50 bg-rose-950/50 p-3"
                      data-testid="offline-assist-stop"
                    >
                      <p className="flex items-start gap-2 text-sm font-semibold text-rose-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        {t("offlineTripPack.doNotDriveTitle")}
                      </p>
                      <p className="mt-2 text-sm text-rose-100">
                        {offlineDoNotDriveCopy()}
                      </p>
                      {match.stopRuleHits.map((r) => (
                        <p key={r.id} className="mt-2 text-xs text-rose-100/90">
                          <span className="font-semibold">{r.id}:</span>{" "}
                          {r.summary_en}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {match.dtcRefs.map((d) => (
                    <div
                      key={d.code}
                      className="rounded-2xl border border-slate-700 bg-slate-900/80 p-3"
                      data-testid={`offline-dtc-${d.code}`}
                    >
                      <p className="text-sm font-semibold text-cyan-300">
                        {d.code} · {d.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-300">{d.summary}</p>
                      {!d.catalogHit ? (
                        <p className="mt-1 text-[11px] text-slate-500">
                          {t("offlineTripPack.unknownDtc")}
                        </p>
                      ) : null}
                      {d.checkOrder.length > 0 ? (
                        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-slate-300">
                          {d.checkOrder.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      ) : null}
                      {d.commonCauses.length > 0 ? (
                        <p className="mt-2 text-[11px] text-slate-500">
                          {t("offlineTripPack.eduChecks")}:{" "}
                          {d.commonCauses.join("; ")}
                        </p>
                      ) : null}
                    </div>
                  ))}

                  {!match.doNotDrive &&
                  match.dtcRefs.length === 0 &&
                  match.stopRuleHits.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      {t("offlineTripPack.noLocalHit")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("offlineTripPack.fluidsTitle")}
                </h3>
                <FluidsBlock pack={pack} />
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("offlineTripPack.contactsTitle")}
                </h3>
                <ContactsBlock pack={pack} />
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("offlineTripPack.placesTitle")}
                </h3>
                <PlacesBlock pack={pack} />
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("offlineTripPack.eduCardsTitle")}
                </h3>
                <ul className="mt-2 space-y-2">
                  {pack.eduCards.map((card) => (
                    <li
                      key={card.id}
                      className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3"
                    >
                      <p className="text-sm font-medium text-slate-200">
                        {card.title}
                      </p>
                      <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-slate-400">
                        {card.steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                      <p className="mt-2 text-[11px] text-amber-200/90">
                        {t("offlineTripPack.stopIf")}: {card.stopIf}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              {obdSession && obdSession.codes.length > 0 ? (
                <div className="rounded-2xl border border-slate-700 p-3 text-xs text-slate-300">
                  <p>
                    {t("offlineTripPack.offlineObd")}:{" "}
                    {obdSession.codes.join(", ")}
                  </p>
                  <p className="mt-1 text-slate-500">
                    {t("offlineTripPack.offlineObdSource")}
                  </p>
                  {online && onCarryObdToChat ? (
                    <button
                      type="button"
                      className="mt-2 text-cyan-400 underline"
                      onClick={() =>
                        onCarryObdToChat(
                          formatOfflineObdForOnlineChat(obdSession),
                        )
                      }
                    >
                      {t("offlineTripPack.carryObdToChat")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="space-y-2 border-t border-slate-800 px-4 py-3">
          {online ? (
            <div
              className="rounded-2xl border border-emerald-700/40 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100"
              data-testid="offline-back-online"
            >
              <p className="font-medium">{t("offlineTripPack.backOnline")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-cyan-500 px-3 py-2 font-semibold text-black"
                  onClick={() => {
                    onOpenFullCoach?.();
                    onClose();
                  }}
                >
                  {t("offlineTripPack.openFullCoach")}
                </button>
                <a
                  className="rounded-xl border border-slate-600 px-3 py-2 text-slate-200"
                  href={systemMapSearchUrl("tow", platformForMaps())}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("offlineTripPack.findTow")}
                </a>
                <a
                  className="rounded-xl border border-slate-600 px-3 py-2 text-slate-200"
                  href={systemMapSearchUrl("repair", platformForMaps())}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("offlineTripPack.findShop")}
                </a>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              {t("offlineTripPack.systemMapsHint")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function FluidsBlock({ pack }: { pack: TripPackManifest }) {
  const { t } = useTranslation();
  const f = pack.fluids;
  const rows: Array<{ label: string; field?: { value: string; source: "user_manual_confirmed" | "user_entered" } }> = [
    { label: t("offlineTripPack.oilCapacity"), field: f.oilCapacity },
    { label: t("offlineTripPack.oilViscosity"), field: f.oilViscosity },
    { label: t("offlineTripPack.coolant"), field: f.coolantSpecText },
    { label: t("offlineTripPack.coolantCap"), field: f.coolantCapacityText },
    { label: t("offlineTripPack.brakeFluid"), field: f.brakeFluidSpecText },
    { label: t("offlineTripPack.atf"), field: f.atfSpecText },
  ];
  const any = rows.some((r) => r.field);
  return (
    <div className="mt-2 space-y-1.5 text-xs text-slate-300">
      {f.transmissionKind === "cvt" ? (
        <p className="text-amber-200/90">{t("offlineTripPack.cvtNote")}</p>
      ) : null}
      {!any ? (
        <p className="text-slate-500">{t("offlineTripPack.noFluids")}</p>
      ) : (
        rows.map((r) =>
          r.field ? (
            <p key={r.label}>
              <span className="text-slate-500">{r.label}:</span> {r.field.value}{" "}
              <span className="text-slate-600">
                · {tripPackFluidSourceLabel(r.field.source)}
              </span>
            </p>
          ) : null,
        )
      )}
    </div>
  );
}

function ContactsBlock({ pack }: { pack: TripPackManifest }) {
  const { t } = useTranslation();
  const { roadsidePhone, insurancePhone, emergencyNote } = pack.contacts;
  if (!roadsidePhone && !insurancePhone && !emergencyNote) {
    return (
      <p className="mt-2 text-xs text-slate-500">
        {t("offlineTripPack.noContacts")}
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-2 text-sm">
      {roadsidePhone ? (
        <li>
          <a
            className="inline-flex items-center gap-2 text-cyan-300"
            href={telHref(roadsidePhone) ?? undefined}
            data-testid="offline-tel-roadside"
          >
            <Phone className="h-4 w-4" />
            {t("offlineTripPack.roadside")}: {roadsidePhone}
          </a>
        </li>
      ) : null}
      {insurancePhone ? (
        <li>
          <a
            className="inline-flex items-center gap-2 text-cyan-300"
            href={telHref(insurancePhone) ?? undefined}
            data-testid="offline-tel-insurance"
          >
            <Phone className="h-4 w-4" />
            {t("offlineTripPack.insurance")}: {insurancePhone}
          </a>
        </li>
      ) : null}
      {emergencyNote ? (
        <li className="text-xs text-slate-400">{emergencyNote}</li>
      ) : null}
    </ul>
  );
}

function PlacesBlock({ pack }: { pack: TripPackManifest }) {
  const { t } = useTranslation();
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);

  if (pack.places.length === 0) {
    return (
      <p className="mt-2 text-xs text-slate-500">{t("offlineTripPack.noPlaces")}</p>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <button
        type="button"
        className="text-[11px] text-cyan-400 underline"
        onClick={() => {
          if (!navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              setHere({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              }),
            () => setHere(null),
            { maximumAge: 60_000, timeout: 8_000 },
          );
        }}
      >
        {t("offlineTripPack.useLocation")}
      </button>
      <ul className="space-y-1.5 text-sm text-slate-300">
        {pack.places.map((p) => {
          let dist: string | null = null;
          if (
            here &&
            typeof p.lat === "number" &&
            typeof p.lng === "number"
          ) {
            dist = `${straightLineKm(here, { lat: p.lat, lng: p.lng }).toFixed(1)} km`;
          }
          return (
            <li key={p.id} className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-slate-500" />
              <span>{p.label}</span>
              {dist ? (
                <span className="text-[11px] text-slate-500">{dist}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] text-slate-600">
        {t("offlineTripPack.placesDisclaimer")}
      </p>
    </div>
  );
}
