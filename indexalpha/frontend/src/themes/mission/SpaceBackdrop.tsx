import { useEffect, useRef } from "react";
import { useReducedMotion } from "../../hooks/useMotion";

interface Star {
  x: number;
  y: number;
  z: number;
  phase: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/** Campo de estrelas em deriva (órbita), cintilando, com meteoros ocasionais e o limbo da Terra embaixo. */
export function SpaceBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let stars: Star[] = [];
    let meteor: Meteor | null = null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(420, Math.floor((window.innerWidth * window.innerHeight) / 2600));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        z: 0.15 + Math.random() * 0.85,
        phase: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    const render = (t: number, dt: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.x -= s.z * 0.12 * dt;
        if (s.x < 0) s.x += w;
        const twinkle = 0.7 + 0.3 * Math.sin(t * 0.0018 + s.phase);
        ctx.globalAlpha = (0.25 + 0.75 * s.z) * twinkle;
        ctx.fillStyle = s.z > 0.92 ? "#cfe6ff" : "#ffffff";
        const size = s.z * 1.5;
        ctx.fillRect(s.x, s.y, size, size);
      }

      if (!meteor && Math.random() < 0.0015 * dt) {
        meteor = { x: Math.random() * w, y: Math.random() * h * 0.4, vx: -7, vy: 3, life: 1 };
      }
      if (meteor) {
        const m = meteor;
        const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 14, m.y - m.vy * 14);
        grad.addColorStop(0, `rgba(207,230,255,${m.life})`);
        grad.addColorStop(1, "rgba(207,230,255,0)");
        ctx.globalAlpha = 1;
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x - m.vx * 14, m.y - m.vy * 14);
        ctx.stroke();
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.life -= 0.012 * dt;
        if (m.life <= 0) meteor = null;
      }
      ctx.globalAlpha = 1;
    };

    if (reduced) {
      render(0, 0);
      return () => window.removeEventListener("resize", resize);
    }

    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(3, (t - last) / 16.7);
      last = t;
      render(t, dt);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reduced]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-black">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      {/* Limbo da Terra: curvatura com atmosfera brilhando */}
      <div
        className="absolute left-1/2 top-[82vh] h-[220vw] w-[280vw] -translate-x-1/2 rounded-[50%] border-t border-ion/50"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(20,40,80,0.9) 0%, #020409 18%, #000 40%)",
          boxShadow: "0 -30px 120px -20px rgba(77,163,255,0.55), inset 0 40px 90px -40px rgba(120,190,255,0.55)",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-20%,rgba(77,163,255,0.10),transparent_55%)]" />
    </div>
  );
}
