"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { API_URL } from "@/lib/api";

// Conta cada página aberta para o painel do dono. Não usa cookie nem guarda nada no
// navegador: o servidor só registra a página, a origem da visita e um código anônimo diário.
function visitSource() {
  try {
    const utm = new URLSearchParams(window.location.search).get("utm_source");
    if (utm) return utm;
    if (!document.referrer) return null;
    const host = new URL(document.referrer).hostname.replace(/^www\./, "");
    return host && host !== window.location.hostname.replace(/^www\./, "") ? host : null;
  } catch {
    return null;
  }
}

export default function VisitTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    fetch(`${API_URL}/api/admin/visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname, source: visitSource() }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);
  return null;
}
