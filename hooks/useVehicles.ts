"use client";

import { useCallback, useEffect, useState } from "react";
import { saveCurrentVehicleId } from "@/lib/chat-storage";
import type { VehicleInfo } from "@/lib/types/chat";
import { userVehiclesService } from "@/lib/user-vehicles";
import { useAuth } from "@/hooks/useAuth";

/**
 * Shared garage state: loads from Supabase user_vehicles,
 * migrates legacy localStorage once, keeps current vehicle in sync.
 */
export function useVehicles() {
  const { user, loading: authLoading } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);
  const [currentVehicle, setCurrentVehicle] = useState<VehicleInfo | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setVehicles([]);
      setCurrentVehicle(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const garage = await userVehiclesService.loadGarage();
      setVehicles(garage.vehicles);
      setCurrentVehicle(garage.current);
    } catch (err) {
      console.error("[useVehicles]", err);
      setError(err instanceof Error ? err.message : "Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  const selectVehicle = useCallback(async (vehicle: VehicleInfo) => {
    setCurrentVehicle(vehicle);
    saveCurrentVehicleId(vehicle.id);
    try {
      await userVehiclesService.setCurrent(vehicle.id);
    } catch (err) {
      console.warn("[useVehicles] setCurrent failed:", err);
    }
  }, []);

  const addVehicle = useCallback(
    async (vehicle: VehicleInfo): Promise<VehicleInfo> => {
      // Persist full config card (incl. VCdb) to Supabase
      const saved = await userVehiclesService.create(vehicle, {
        makeCurrent: true,
      });
      setVehicles((prev) => {
        const withoutDup = prev.filter((v) => v.id !== saved.id);
        return [...withoutDup, saved];
      });
      setCurrentVehicle(saved);
      saveCurrentVehicleId(saved.id);
      return saved;
    },
    [],
  );

  const updateVehicle = useCallback(async (vehicle: VehicleInfo) => {
    const saved = await userVehiclesService.update(vehicle);
    setVehicles((prev) => prev.map((v) => (v.id === saved.id ? saved : v)));
    setCurrentVehicle((cur) => (cur?.id === saved.id ? saved : cur));
    return saved;
  }, []);

  const archiveVehicle = useCallback(async (vehicleId: string) => {
    await userVehiclesService.archive(vehicleId);
    const garage = await userVehiclesService.loadGarage();
    setVehicles(garage.vehicles);
    setCurrentVehicle(garage.current);
    if (garage.current) saveCurrentVehicleId(garage.current.id);
  }, []);

  const removeVehicle = useCallback(async (vehicleId: string) => {
    await userVehiclesService.remove(vehicleId);
    const garage = await userVehiclesService.loadGarage();
    setVehicles(garage.vehicles);
    setCurrentVehicle(garage.current);
    if (garage.current) saveCurrentVehicleId(garage.current.id);
  }, []);

  return {
    vehicles,
    currentVehicle,
    loading: authLoading || loading,
    error,
    refresh,
    selectVehicle,
    addVehicle,
    updateVehicle,
    archiveVehicle,
    removeVehicle,
  };
}
