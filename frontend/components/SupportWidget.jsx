"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { WHATSAPP_URL } from "@/lib/contact";

// Botão flutuante de dúvidas: abre a conversa no WhatsApp direto.
export default function SupportWidget() {
  const pathname = usePathname();

  // Outros lugares do site (ex.: Perfil) chamam window.dispatchEvent(new Event("open-support")).
  useEffect(() => {
    const onOpen = () => window.open(WHATSAPP_URL, "_blank", "noopener");
    window.addEventListener("open-support", onOpen);
    return () => window.removeEventListener("open-support", onOpen);
  }, []);

  if (pathname?.startsWith("/admin")) return null;
  // No painel, no celular, o botão flutuante ficaria em cima do chat: lá ele abre pelo Perfil.
  const inDashboard = pathname?.startsWith("/dashboard");

  return (
    <div className="fixed bottom-24 right-4 z-50 lg:bottom-6 lg:right-6">
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Dúvidas no WhatsApp"
        className={`items-center gap-2 rounded-full bg-gradient-to-r from-neon to-volt px-4 py-3 font-display text-sm font-semibold text-void shadow-neon ${inDashboard ? "hidden lg:flex" : "flex"}`}
      >
        <MessageCircle size={18} /> Dúvidas?
      </a>
    </div>
  );
}
