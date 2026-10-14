"use client";
import { useEffect, useRef } from "react";

// Poeira de estrelas do fundo (visual b+): pontinhos que piscam e sobem devagar. Parado se o sistema pede menos movimento.
export default function Stars({ density = 0.00012, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const calmo = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, pts = [], raf = 0;

    const montar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pts = Array.from({ length: Math.round(w * h * density) }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.1 + 0.2,
        v: Math.random() * 0.12 + 0.02, f: Math.random() * Math.PI * 2
      }));
    };
    const desenhar = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        if (!calmo) { p.y -= p.v; if (p.y < -2) { p.y = h + 2; p.x = Math.random() * w; } }
        const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t / 900 + p.f));
        ctx.fillStyle = `rgba(214,206,255,${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      if (!calmo) raf = requestAnimationFrame(desenhar);
    };
    montar();
    desenhar(0);
    const ro = new ResizeObserver(() => { montar(); if (calmo) desenhar(0); });
    ro.observe(cv);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [density]);

  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
