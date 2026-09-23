"use client";
import { useEffect } from "react";

// Guarda a versão carregada e, quando a pessoa volta para a aba (ou a cada 10 min),
// recarrega a página se já houver uma versão mais nova publicada.
export default function AutoUpdate() {
  useEffect(() => {
    const loaded = process.env.NEXT_PUBLIC_BUILD_VERSION;
    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { version } = await res.json();
        if (!version || !loaded || version === loaded || loaded === "dev") return;
        // No máximo uma recarga por versão nova (evita loop se algo vier diferente).
        let done = null;
        try { done = sessionStorage.getItem("tradeon_reloaded_for"); } catch {}
        if (done === version) return;
        try { sessionStorage.setItem("tradeon_reloaded_for", version); } catch {}
        window.location.reload();
      } catch {}
    };
    check();
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    const id = setInterval(check, 10 * 60_000);
    return () => { document.removeEventListener("visibilitychange", onVisible); clearInterval(id); };
  }, []);
  return null;
}
