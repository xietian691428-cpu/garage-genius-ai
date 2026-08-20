"use client";

import { Binary, Bluetooth, Camera, MessageSquare, Settings2 } from "lucide-react";

type Props = {
  showObdConnect: boolean;
  onStartChat: () => void;
  onEnterCode: () => void;
  onUploadPhoto: () => void;
  onConnectObd: () => void;
  onObdSettings: () => void;
};

const btn =
  "flex min-h-[72px] min-w-[7.5rem] flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-700 bg-[#111827] px-3 py-3 text-xs font-semibold text-slate-100 transition hover:border-cyan-500/40 hover:text-cyan-200 sm:min-w-0";

export default function QuickActionsRow({
  showObdConnect,
  onStartChat,
  onEnterCode,
  onUploadPhoto,
  onConnectObd,
  onObdSettings,
}: Props) {
  return (
    <section data-testid="home-quick-actions">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Quick actions
      </h3>
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible">
        <button
          type="button"
          data-testid="home-qa-chat"
          onClick={onStartChat}
          className={btn}
        >
          <MessageSquare className="h-5 w-5 text-cyan-400" />
          Chat
        </button>
        <button
          type="button"
          data-testid="home-qa-code"
          onClick={onEnterCode}
          className={btn}
        >
          <Binary className="h-5 w-5 text-cyan-400" />
          Code
        </button>
        <button
          type="button"
          data-testid="home-qa-photo"
          onClick={onUploadPhoto}
          className={btn}
        >
          <Camera className="h-5 w-5 text-cyan-400" />
          Photo
        </button>
        {showObdConnect ? (
          <button
            type="button"
            data-testid="home-qa-obd"
            onClick={onConnectObd}
            className={btn}
          >
            <Bluetooth className="h-5 w-5 text-cyan-400" />
            Connect OBD
          </button>
        ) : (
          <button
            type="button"
            data-testid="home-qa-obd-settings"
            onClick={onObdSettings}
            title="I have an OBD adapter"
            className={btn}
          >
            <Settings2 className="h-5 w-5 text-slate-400" />
            My OBD
          </button>
        )}
      </div>
    </section>
  );
}
