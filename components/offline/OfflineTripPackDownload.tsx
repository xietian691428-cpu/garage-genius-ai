"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VehicleInfo } from "@/lib/types/chat";
import { supabase } from "@/lib/supabase";
import { buildTripPack } from "@/lib/offline-trip-pack/build-pack";
import {
  loadTripPack,
  saveTripPack,
} from "@/lib/offline-trip-pack/store";
import type {
  TripPackEmergencyContacts,
  TripPackManifest,
  TripPackSavedPlace,
} from "@/lib/offline-trip-pack/types";
import { isBrowserOnline } from "@/lib/offline-trip-pack/online";

type Props = {
  vehicle: VehicleInfo | null;
  onOpenAssist?: () => void;
  className?: string;
};

export default function OfflineTripPackDownload({
  vehicle,
  onOpenAssist,
  className = "",
}: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pack, setPack] = useState<TripPackManifest | null>(null);
  const [roadsidePhone, setRoadsidePhone] = useState("");
  const [insurancePhone, setInsurancePhone] = useState("");
  const [emergencyNote, setEmergencyNote] = useState("");
  const [placeLabel, setPlaceLabel] = useState("");
  const [placeLat, setPlaceLat] = useState("");
  const [placeLng, setPlaceLng] = useState("");
  const [places, setPlaces] = useState<TripPackSavedPlace[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!vehicle?.id) {
        setPack(null);
        return;
      }
      // Prefer getSession (local) so offline remounts still find the pack.
      // getUser() hits the network and fails in airplane mode.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || cancelled) return;
      const existing = await loadTripPack(userId, vehicle.id);
      if (cancelled) return;
      setPack(existing);
      if (existing) {
        setRoadsidePhone(existing.contacts.roadsidePhone ?? "");
        setInsurancePhone(existing.contacts.insurancePhone ?? "");
        setEmergencyNote(existing.contacts.emergencyNote ?? "");
        setPlaces(existing.places ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vehicle?.id]);

  const download = async () => {
    if (!vehicle) return;
    setBusy(true);
    setError(null);
    try {
      if (!isBrowserOnline()) {
        throw new Error(t("offlineTripPack.needOnlineToDownload"));
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error(t("offlineTripPack.signInRequired"));

      const contacts: TripPackEmergencyContacts = {
        roadsidePhone: roadsidePhone.trim() || undefined,
        insurancePhone: insurancePhone.trim() || undefined,
        emergencyNote: emergencyNote.trim() || undefined,
      };

      const next = buildTripPack({
        userId,
        vehicle,
        contacts,
        places,
      });
      await saveTripPack(next);
      setPack(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("offlineTripPack.downloadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const addPlace = () => {
    const label = placeLabel.trim();
    if (!label) return;
    const lat = placeLat.trim() ? Number(placeLat) : undefined;
    const lng = placeLng.trim() ? Number(placeLng) : undefined;
    setPlaces((prev) => [
      ...prev,
      {
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `place-${Date.now()}`,
        label,
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
      },
    ]);
    setPlaceLabel("");
    setPlaceLat("");
    setPlaceLng("");
  };

  if (!vehicle) return null;

  return (
    <div
      className={`rounded-2xl border border-slate-700 bg-slate-900/50 p-4 ${className}`}
      data-testid="offline-trip-pack-download"
    >
      <h3 className="text-sm font-semibold text-white">
        {t("offlineTripPack.downloadTitle")}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        {t("offlineTripPack.downloadBlurb")}
      </p>
      <p className="mt-2 text-[11px] text-slate-500">
        {t("offlineTripPack.systemMapsHint")}
      </p>

      <div className="mt-3 space-y-2">
        <label className="block text-[11px] text-slate-500">
          {t("offlineTripPack.roadside")}
          <input
            value={roadsidePhone}
            onChange={(e) => setRoadsidePhone(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            inputMode="tel"
            data-testid="offline-pack-roadside"
          />
        </label>
        <label className="block text-[11px] text-slate-500">
          {t("offlineTripPack.insurance")}
          <input
            value={insurancePhone}
            onChange={(e) => setInsurancePhone(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            inputMode="tel"
            data-testid="offline-pack-insurance"
          />
        </label>
        <label className="block text-[11px] text-slate-500">
          {t("offlineTripPack.emergencyNote")}
          <textarea
            value={emergencyNote}
            onChange={(e) => setEmergencyNote(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      <div className="mt-3 space-y-2">
        <p className="text-[11px] font-medium text-slate-400">
          {t("offlineTripPack.placesTitle")}
        </p>
        <input
          value={placeLabel}
          onChange={(e) => setPlaceLabel(e.target.value)}
          placeholder={t("offlineTripPack.placeLabel")}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        />
        <div className="flex gap-2">
          <input
            value={placeLat}
            onChange={(e) => setPlaceLat(e.target.value)}
            placeholder="lat"
            className="w-1/2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <input
            value={placeLng}
            onChange={(e) => setPlaceLng(e.target.value)}
            placeholder="lng"
            className="w-1/2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <button
          type="button"
          onClick={addPlace}
          className="text-xs text-cyan-400 underline"
        >
          {t("offlineTripPack.addPlace")}
        </button>
        {places.length > 0 ? (
          <ul className="text-xs text-slate-400">
            {places.map((p) => (
              <li key={p.id}>{p.label}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 text-xs text-rose-400" role="alert">
          {error}
        </p>
      ) : null}

      {pack ? (
        <p className="mt-2 text-[11px] text-emerald-300/90" data-testid="offline-pack-meta">
          {t("offlineTripPack.packReady", {
            bytes: pack.approxBytes,
            at: pack.downloadedAt.slice(0, 10),
            hash: pack.contentHash,
          })}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void download()}
          data-testid="offline-pack-download-btn"
          className="min-h-[44px] rounded-2xl bg-cyan-500 px-4 text-sm font-semibold text-black disabled:opacity-60"
        >
          {busy
            ? t("offlineTripPack.downloading")
            : pack
              ? t("offlineTripPack.refreshPack")
              : t("offlineTripPack.downloadCta")}
        </button>
        {pack && onOpenAssist ? (
          <button
            type="button"
            onClick={onOpenAssist}
            data-testid="offline-pack-open-assist"
            className="min-h-[44px] rounded-2xl border border-slate-600 px-4 text-sm text-slate-200"
          >
            {t("offlineTripPack.openAssist")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
