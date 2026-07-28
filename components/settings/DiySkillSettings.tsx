"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  DIY_SKILL_OPTIONS,
  type DiySkillLevel,
} from "@/lib/diy-skill";

export default function DiySkillSettings() {
  const { session } = useAuth();
  const [skill, setSkill] = useState<DiySkillLevel>("beginner");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/diy-skill", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as { diySkill?: string };
          if (data.diySkill) setSkill(data.diySkill as DiySkillLevel);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [session?.access_token]);

  async function save(next: DiySkillLevel) {
    if (!session?.access_token) return;
    setSkill(next);
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/diy-skill", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ diySkill: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          hint?: string;
        };
        throw new Error(body.error || "Could not save DIY skill level.");
      }
      setMessage("Coaching depth updated");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-800 bg-[#111827] p-5">
      <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
        DIY coaching level
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        Matches answer depth to your wrenching experience — beginners get safer
        plain-language steps; advanced gets denser tech detail.
      </p>
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-4 grid gap-2">
          {DIY_SKILL_OPTIONS.map((opt) => {
            const selected = skill === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={saving}
                onClick={() => void save(opt.value)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  selected
                    ? "border-cyan-400/70 bg-cyan-500/10"
                    : "border-slate-800 bg-slate-900/40 hover:border-slate-600"
                }`}
              >
                <p className="font-medium text-white">{opt.label}</p>
                <p className="mt-0.5 text-xs text-slate-400">{opt.hint}</p>
              </button>
            );
          })}
        </div>
      )}
      {message && (
        <p className="mt-3 text-xs text-slate-500">{message}</p>
      )}
    </section>
  );
}
