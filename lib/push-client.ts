/**
 * Browser Web Push registration → POST /api/push/subscribe
 * Requires NEXT_PUBLIC_VAPID_PUBLIC_KEY (and matching private key on server/Edge).
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function enableWebPushReminders(
  accessToken: string,
): Promise<{ ok: boolean; message: string }> {
  if (!isWebPushSupported()) {
    return {
      ok: false,
      message: "Web Push is not supported in this browser.",
    };
  }

  const vapid = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
  if (!vapid) {
    console.warn(
      "[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY missing — push cannot be enabled.",
    );
    return {
      ok: false,
      message:
        "Push notifications are temporarily unavailable. Please try again later.",
    };
  }

  // Quiet re-subscribe when permission already granted (Dashboard mount)
  if (Notification.permission === "denied") {
    return { ok: false, message: "Notification permission was denied." };
  }

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, message: "Notification permission was denied." };
    }
  }

  const registration = await navigator.serviceWorker.ready.catch(async () => {
    return navigator.serviceWorker.register("/sw.js");
  });

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    }));

  const json = subscription.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      message: payload.error || "Could not save push reminders.",
    };
  }

  return { ok: true, message: "Push reminders enabled on this device." };
}

/** Re-register SW + push if user already granted permission (no prompt). */
export async function syncWebPushIfGranted(
  accessToken: string,
): Promise<void> {
  if (!isWebPushSupported()) return;
  if (Notification.permission !== "granted") return;
  if (!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim()) return;
  await enableWebPushReminders(accessToken);
}
