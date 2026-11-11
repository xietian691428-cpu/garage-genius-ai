/** Cross-tab bridge: Settings offline assist → Chat draft (user-provided codes). */

const KEY = "gg_offline_carry_to_chat";

export function stashOfflineCarryToChat(text: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(KEY, text);
  } catch {
    /* ignore */
  }
}

export function consumeOfflineCarryToChat(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const text = sessionStorage.getItem(KEY);
    if (text) sessionStorage.removeItem(KEY);
    return text;
  } catch {
    return null;
  }
}
