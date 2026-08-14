"use client";

import type { ReactNode } from "react";
import { hideStorePurchaseUi } from "@/lib/native-platform";

/** Render store-shell copy in Capacitor; keep web wording elsewhere. */
export default function StoreSafeText({
  store,
  web,
  forceStoreSafe = false,
}: {
  store: ReactNode;
  web: ReactNode;
  forceStoreSafe?: boolean;
}) {
  return <>{forceStoreSafe || hideStorePurchaseUi() ? store : web}</>;
}
