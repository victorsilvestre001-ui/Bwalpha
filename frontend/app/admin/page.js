"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Loader2, RefreshCw, UserPlus, Users, Crown, Globe, Sparkles, UsersRound } from "lucide-react";
import Logo from "@/components/Logo";
import { api, getSessionUser } from "@/lib/api";

const REFRESH_MS = 5 * 60 * 1000;

const PLAN = {
  vip: "border-neon/40 bg-neon/10 text-neon",
  free: "border-void-line text-mist-dim",
};

function fmt(n) {
  return n == null ? "—" : Number(n).toLocaleString("pt-BR");
}
function ddmm(day) {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}
function hhmmss(ms) {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Tile({ icon: Icon, label, value, hint }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-mist-faint">
        <Icon size={12} /> {label}
      </div>
      <div className="mt-2 font-display text-3xl font-bold tabular-nums text-mist">{fmt(value)}</div>
      {hint && <div className="mt-1 text-xs text-mist-faint">{hint}</div>}
    </div>
  );
}

// Barras diárias de uma série só (o título diz o que é). Passe o mouse para ver o dia.
function DailyBars({ title, days, valueKey, unit, colorClass, extra }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...days.map((d) => d[valueKey]));
  const total = days.reduce((sum, d) => sum + d[valueKey], 0);
  const h = hover != null ? days[hover] : null;

  return (
    <div className="panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-sm font-semibold text-mist">{title}</h3>
        <span className="font-mono text-xs text-mist-faint">{fmt(total)} em 14 dias</span>
      </div>
      <div className="mt-1 h-5 text-xs text-mist-dim">
        {h ? <>{ddmm(h.day)} · <span className="font-semibold text-mist">{fmt(h[valueKey])}</span> {unit}{extra ? ` · ${extra(h)}` : ""}</> : "Passe o mouse nas barras para ver cada dia."}
      </div>
      <div className="relative mt-3 flex h-40 items-end gap-[2px] border-b border-void-line pt-4" onMouseLeave={() => setHover(null)}>
        <span className="pointer-events-none absolute left-0 top-0 font-mono text-[10px] text-mist-faint">{fmt(max)}</span>
        {days.map((d, i) => (
          <div
            key={d.day}
            className="flex h-full flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
            aria-label={`${ddmm(d.day)}: ${d[valueKey]} ${unit}`}
          >
            <div
              className={`w-full rounded-t-[4px] transition-opacity ${colorClass} ${hover != null && hover !== i ? "opacity-40" : ""}`}
              style={{ height: `${d[valueKey] > 0 ? Math.max(3, (d[valueKey] / max) * 100) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px]">
        {days.map((d, i) => (
          <span key={d.day} className="flex-1 text-center font-mono text-[9px] text-mist-faint">{i % 2 === days.length % 2 ? "" : ddmm(d.day)}</span>
        ))}
      </div>
    </div>
  );
}

function RankList({ title, rows, labelKey, emptyText }) {
  const max = Math.max(1, ...rows.map((r) => r.visits));
  return (
    <div className="panel p-5">
      <h3 className="font-display text-sm font-semibold text-mist">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-mist-faint">{emptyText}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r[labelKey]}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-mono text-mist">{r[labelKey]}</span>
                <span className="font-mono tabular-nums text-mist-dim">{fmt(r.visits)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-void-line">
                <div className="h-full rounded-full bg-neon/80" style={{ width: `${(r.visits / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.adminStats());
      setUpdatedAt(Date.now());
      setError("");
    } catch (err) {
      if (err.status === 401 || err.status === 403) { router.replace("/dashboard"); return; }
      setError(err.message || "Não foi possível carregar o painel.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (getSessionUser()?.plan !== "owner") { router.replace("/dashboard"); return; }
    load();
    const refresh = setInterval(load, REFRESH_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(refresh); clearInterval(clock); };
  }, [load, router]);

  const a = data?.accounts;
  const v = data?.visits;

  return (
    <main className="relative min-h-screen bg-void font-body text-mist">
      <div className="aurora pointer-events-none fixed inset-0 opacity-50" />
      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-6 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Logo href="/dashboard" size={30} />
            <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-mist-dim hover:text-mist"><ArrowLeft size={15} /> Voltar ao painel</Link>
          </div>
          <div className="flex items-center gap-3 text-xs text-mist-faint">
            {updatedAt && <span>Atualizado às {hhmmss(updatedAt)} · próxima em {mmss(updatedAt + REFRESH_MS - now)}</span>}
            <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-void-line px-3 py-1.5 text-mist-dim hover:border-neon/40 hover:text-mist">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Atualizar
            </button>
          </div>
        </header>

        <h1 className="mt-8 font-display text-3xl font-bold text-mist">Painel do dono</h1>
        <p className="mt-1 text-sm text-mist-dim">Contas e visitas do site, no horário de Brasília. Atualiza sozinho a cada 5 minutos.</p>

        {error && <p className="mt-6 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember-soft">{error}</p>}

        {!data ? (
          <div className="flex justify-center py-24"><Loader2 className="animate-spin text-neon" /></div>
        ) : (
          <div className="mt-8 space-y-8">
            <section>
              <h2 className="mb-3 font-mono text-[11px] uppercase tracking-widest text-mist-faint">Contas registradas</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile icon={Users} label="Total" value={a.total} hint="sem contar a sua" />
                <Tile icon={UserPlus} label="Hoje" value={a.today} />
                <Tile icon={UserPlus} label="Últimos 7 dias" value={a.last7} hint={`${fmt(a.last30)} nos últimos 30`} />
                <Tile icon={Crown} label="VIP" value={a.vip} hint={a.total ? `${Math.round((a.vip / a.total) * 100)}% das contas` : null} />
              </div>
            </section>

            <section>
              <h2 className="mb-3 font-mono text-[11px] uppercase tracking-widest text-mist-faint">Visitas no site</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile icon={Eye} label="Visitas hoje" value={v.today} hint="páginas abertas" />
                <Tile icon={UsersRound} label="Pessoas hoje" value={v.unique_today} hint={`média de ${fmt(v.avgPeople7)} por dia na semana`} />
                <Tile icon={Eye} label="Visitas 7 dias" value={v.last7} />
                <Tile icon={Eye} label="Visitas 30 dias" value={v.last30} hint={`${fmt(v.total)} no total`} />
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <DailyBars title="Visitas por dia" days={data.daily} valueKey="visits" unit="visitas" colorClass="bg-neon" extra={(d) => `${fmt(d.people)} pessoas`} />
              <DailyBars title="Novas contas por dia" days={data.daily} valueKey="signups" unit="contas" colorClass="bg-volt" />
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <RankList title="Páginas mais vistas (7 dias)" rows={data.topPages} labelKey="path" emptyText="Ainda sem visitas registradas." />
              <RankList title="De onde vieram (7 dias)" rows={data.topSources} labelKey="source" emptyText="Ainda sem visitas registradas." />
              <div className="panel p-5">
                <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-mist"><Sparkles size={15} className="text-neon" /> Sinais gerados hoje</h3>
                <div className="mt-3 font-display text-4xl font-bold tabular-nums text-mist">{fmt(data.signalsToday)}</div>
                <p className="mt-2 text-xs text-mist-faint">Análises pedidas por todos os usuários hoje.</p>
              </div>
            </section>

            <section className="panel p-5">
              <h3 className="font-display text-sm font-semibold text-mist">Últimas contas criadas</h3>
              {data.recentUsers.length === 0 ? (
                <p className="mt-4 text-sm text-mist-faint">Nenhuma conta ainda.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-void-line font-mono text-[10px] uppercase tracking-widest text-mist-faint">
                        <th className="py-2 pr-4 font-medium">Nome</th>
                        <th className="py-2 pr-4 font-medium">E-mail</th>
                        <th className="py-2 pr-4 font-medium">Plano</th>
                        <th className="py-2 font-medium">Criada em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentUsers.map((u, i) => (
                        <tr key={i} className="border-b border-void-line/60 last:border-0">
                          <td className="py-2.5 pr-4 text-mist">{u.name}</td>
                          <td className="py-2.5 pr-4 font-mono text-xs text-mist-dim">{u.email}</td>
                          <td className="py-2.5 pr-4">
                            <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase ${PLAN[u.plan] || PLAN.free}`}>{u.plan}</span>
                          </td>
                          <td className="py-2.5 font-mono text-xs text-mist-dim">{new Date(u.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <p className="flex items-center gap-1.5 text-xs text-mist-faint">
              <Globe size={12} /> As visitas passaram a ser contadas a partir de hoje. Visitas do perfil do Instagram ficam no próprio Instagram (Painel profissional).
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
