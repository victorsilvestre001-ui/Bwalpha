"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getConsent, setConsent, loadTrackers } from "@/lib/track";

export default function ConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const c = getConsent();
    if (c === "all") loadTrackers();
    else if (!c) setShow(true);
  }, []);

  if (!show) return null;

  function choose(value) {
    setConsent(value);
    setShow(false);
  }

  return (
    <div role="dialog" aria-live="polite" aria-label="Aviso de cookies" className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-3xl rounded-2xl border border-void-line bg-void-card/95 p-4 shadow-card backdrop-blur-xl md:inset-x-6 md:bottom-6 md:p-5" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <p className="text-sm leading-relaxed text-mist-dim">
        Usamos cookies essenciais para o site funcionar e, com a sua permissão, cookies de marketing (Meta e Google) para medir nossos anúncios.
        Saiba mais na <Link href="/privacidade" className="text-neon underline-offset-2 hover:underline">Política de privacidade</Link>.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button onClick={() => choose("essential")} className="btn-ghost !py-2.5 text-sm">Somente essenciais</button>
        <button onClick={() => choose("all")} className="btn-primary !py-2.5 text-sm">Aceitar todos</button>
      </div>
    </div>
  );
}
