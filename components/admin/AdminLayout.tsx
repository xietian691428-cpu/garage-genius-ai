"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Wrench } from "lucide-react";
import { adminLogoutAction } from "@/app/admin/actions";
import { ADMIN_NAV_GROUPS } from "@/lib/admin-nav";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh bg-[#0a0f1c] text-slate-200">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-[#0a0f1c] lg:flex">
        <div className="flex items-center gap-3 border-b border-slate-800 p-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-cyan-500">
            <Wrench className="h-5 w-5 text-black" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">运营后台</p>
            <p className="-mt-0.5 text-xs text-cyan-400">Garage Genius</p>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
          {ADMIN_NAV_GROUPS.map((group) => (
            <div key={group.id}>
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = item.exact
                    ? pathname === item.href
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-xl px-3 py-2 text-sm transition-colors ${
                        active
                          ? "bg-slate-800 font-medium text-white"
                          : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <form action={adminLogoutAction} className="border-t border-slate-800 p-4">
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm text-slate-400 transition-colors hover:bg-slate-900 hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 overflow-x-auto border-b border-slate-800 px-4 py-3 lg:hidden">
          {ADMIN_NAV_GROUPS.flatMap((g) => g.items).map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href ||
                pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                  active
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "bg-slate-900 text-slate-400"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <form action={adminLogoutAction} className="ml-auto shrink-0">
            <button
              type="submit"
              className="rounded-full bg-slate-900 px-3 py-1.5 text-xs text-slate-400"
            >
              退出
            </button>
          </form>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
