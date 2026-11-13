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
  "flex min-h-[56px] min-w-[6rem] flex-1 flex-col items-center justify-center gap-1 rounded-2xl border border-slate-800 bg-transparent px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-200 sm:min-w-0";

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
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Or start another way
      </h3>
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible">
        <button
          type="button"
          data-testid="home-qa-chat"
          onClick={onStartChat}
          className={btn}
        >
          <MessageSquare className="h-4 w-4 text-cyan-400" />
          Describe issue
        </button>
        <button
          type="button"
          data-testid="home-qa-code"
          onClick={onEnterCode}
          className={btn}
        >
          <Binary className="h-4 w-4 text-cyan-400" />
          Enter code
        </button>
        <button
          type="button"
          data-testid="home-qa-photo"
          onClick={onUploadPhoto}
          className={btn}
        >
          <Camera className="h-4 w-4 text-cyan-400" />
          Photo check
        </button>
        {showObdConnect ? (
          <button
            type="button"
            data-testid="home-qa-obd"
            onClick={onConnectObd}
            className={btn}
          >
            <Bluetooth className="h-4 w-4 text-cyan-400" />
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
            <Settings2 className="h-4 w-4 text-slate-400" />
            My OBD
          </button>
        )}
      </div>
    </section>
  );
}
