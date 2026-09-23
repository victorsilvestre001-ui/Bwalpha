"use client";
import { LineChart, Bot, History, UserRound, LogOut, Crown } from "lucide-react";
import Logo from "@/components/Logo";

export const TABS = [
  { id: "analise", label: "Análise", icon: LineChart },
  { id: "assistente", label: "Assistente IA", icon: Bot },
  { id: "historico", label: "Histórico", icon: History },
  { id: "perfil", label: "Perfil", icon: UserRound }
];

export function isPaid(user) {
  return user?.plan === "vip" || user?.plan === "owner";
}

function Avatar({ user, size = 36 }) {
  const initials = (user?.name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  if (user?.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatar_url} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div className="flex items-center justify-center rounded-full bg-gradient-to-br from-neon to-volt font-display text-xs font-bold text-void" style={{ width: size, height: size }}>
      {initials}
    </div>
  );
}

export { Avatar };

export default function Sidebar({ user, tab, onChangeTab, onLogout }) {
  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-void-line bg-void-raised/80 p-5 backdrop-blur-xl lg:flex">
        <Logo href="/dashboard" />
        <nav className="mt-10 flex flex-1 flex-col gap-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onChangeTab(t.id)}
                className={`group flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-all ${active ? "bg-gradient-to-r from-neon/15 to-volt/5 text-mist" : "text-mist-dim hover:bg-white/[0.03] hover:text-mist"}`}
              >
                <t.icon size={18} className={active ? "text-neon" : "text-mist-faint group-hover:text-mist-dim"} />
                {t.label}
                {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-neon shadow-neon" />}
              </button>
            );
          })}
        </nav>

        {!isPaid(user) && (
          <button onClick={() => onChangeTab("perfil")} className="grad-border mb-4 rounded-xl bg-void-card p-4 text-left">
            <div className="flex items-center gap-2 font-display text-sm font-semibold text-mist"><Crown size={16} className="text-neon" /> Seja VIP</div>
            <p className="mt-1 text-xs text-mist-dim">Libere os sinais da IA.</p>
          </button>
        )}

        <div className="flex items-center gap-3 rounded-xl border border-void-line bg-void-deep/60 p-3">
          <Avatar user={user} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-mist">{user?.name}</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-neon">{user?.plan || "free"}</div>
          </div>
          <button onClick={onLogout} className="rounded-lg p-2 text-mist-faint hover:bg-white/5 hover:text-ember-soft" aria-label="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-void-line bg-void/85 px-4 backdrop-blur-xl lg:hidden">
        <Logo href="/dashboard" size={28} />
        <button onClick={onLogout} className="rounded-lg p-2 text-mist-dim" aria-label="Sair"><LogOut size={18} /></button>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-void-line bg-void/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => onChangeTab(t.id)} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${active ? "text-neon" : "text-mist-faint"}`}>
              <t.icon size={20} />
              {t.label.split(" ")[0]}
            </button>
          );
        })}
      </nav>
    </>
  );
}
