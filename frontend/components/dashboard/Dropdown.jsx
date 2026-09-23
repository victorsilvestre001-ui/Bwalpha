"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

// options: [{ value, label, hint }]
export default function Dropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-mist-faint">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-void-deep/70 px-4 py-3 text-left transition-colors ${open ? "border-neon/60" : "border-void-line hover:border-neon/40"}`}
      >
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-mist">{current.label}</span>
          {current.hint && <span className="text-xs text-mist-dim">{current.hint}</span>}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-mist-dim transition-transform ${open ? "rotate-180 text-neon" : ""}`} />
      </button>

      {open && (
        <ul role="listbox" className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl border border-void-line bg-void-card p-1 shadow-card">
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${selected ? "bg-neon/10" : "hover:bg-white/[0.04]"}`}
                >
                  <span className="flex items-baseline gap-2">
                    <span className={`font-mono text-sm font-semibold ${selected ? "text-neon" : "text-mist"}`}>{o.label}</span>
                    {o.hint && <span className="text-xs text-mist-dim">{o.hint}</span>}
                  </span>
                  {selected && <Check size={15} className="text-neon" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
