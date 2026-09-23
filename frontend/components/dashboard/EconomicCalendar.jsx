"use client";
import { useEffect, useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

const IMPACT = {
  high: { label: "Alto", cls: "bg-ember/15 text-ember-soft border-ember/30", bars: 3 },
  medium: { label: "Médio", cls: "bg-volt/15 text-volt-soft border-volt/30", bars: 2 },
  low: { label: "Baixo", cls: "bg-void-line/60 text-mist-dim border-void-line", bars: 1 }
};

function groupByDay(events) {
  const groups = {};
  for (const ev of events) {
    const d = new Date(ev.event_time);
    const key = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
    (groups[key] ||= []).push(ev);
  }
  return Object.entries(groups);
}

export default function EconomicCalendar({ compact = false }) {
  const [events, setEvents] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api.calendar().then((e) => setEvents(Array.isArray(e) ? e : [])).catch(() => setEvents([]));
  }, []);

  const list = (events || []).filter((e) => filter === "all" || e.impact === "high");
  const shown = compact ? list.slice(0, 5) : list;

  return (
    <div className="panel panel-glow p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={18} className="text-neon" />
          <h2 className="font-display text-lg font-semibold text-mist">Calendário econômico</h2>
        </div>
        <div className="flex rounded-lg border border-void-line bg-void-deep/70 p-0.5 text-xs">
          {[["all", "Todos"], ["high", "Alto impacto"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-md px-3 py-1.5 transition-colors ${filter === k ? "bg-neon/15 text-neon" : "text-mist-dim hover:text-mist"}`}>{l}</button>
          ))}
        </div>
      </div>

      {events === null ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-neon" /></div>
      ) : shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-mist-dim">Nenhum evento programado no momento.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {groupByDay(shown).map(([day, evs]) => (
            <div key={day}>
              <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-mist-faint">{day}</div>
              <div className="divide-y divide-void-line overflow-hidden rounded-xl border border-void-line">
                {evs.map((ev) => {
                  const imp = IMPACT[ev.impact] || IMPACT.medium;
                  return (
                    <div key={ev.id} className="grid grid-cols-[56px_1fr_auto] items-center gap-3 bg-void-deep/40 px-4 py-3 sm:grid-cols-[64px_1fr_auto_auto]">
                      <span className="font-mono text-sm text-mist">{new Date(ev.event_time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                      <div className="min-w-0">
                        <div className="truncate text-sm text-mist">{ev.event_name}</div>
                        <div className="text-xs text-mist-faint">{ev.country}{ev.forecast ? ` · Prev. ${ev.forecast}` : ""}{ev.previous ? ` · Ant. ${ev.previous}` : ""}</div>
                      </div>
                      <span className={`hidden rounded-full border px-2 py-0.5 text-[11px] sm:inline ${imp.cls}`}>{imp.label}</span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3].map((b) => <span key={b} className={`h-3 w-1 rounded-full ${b <= imp.bars ? (ev.impact === "high" ? "bg-ember" : "bg-volt") : "bg-void-line"}`} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
