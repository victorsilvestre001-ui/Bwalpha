"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Send, Loader2, CheckCircle2, Mail } from "lucide-react";
import { api, getSessionUser } from "@/lib/api";

const SUPPORT_EMAIL = "tradeonia@gmail.com";

// Botão flutuante de dúvidas: a mensagem chega no e-mail de suporte, com resposta direta para quem escreveu.
export default function SupportWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  // Outros lugares do site (ex.: Perfil) abrem o formulário com window.dispatchEvent(new Event("open-support")).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-support", onOpen);
    return () => window.removeEventListener("open-support", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const u = getSessionUser();
    if (u) setForm((f) => ({ ...f, name: f.name || u.name || "", email: f.email || u.email || "" }));
  }, [open]);

  if (pathname?.startsWith("/admin")) return null;
  // No painel, no celular, o botão flutuante ficaria em cima do chat: lá ele abre pelo Perfil.
  const inDashboard = pathname?.startsWith("/dashboard");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      await api.support({ ...form, page: pathname });
      setSent(true);
      setForm((f) => ({ ...f, message: "" }));
    } catch (err) {
      setError(err.message || "Não foi possível enviar agora.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-24 right-4 z-50 lg:bottom-6 lg:right-6">
      {open && (
        <div className="panel mb-3 w-[min(92vw,360px)] p-5 shadow-2xl" style={{ background: "#0B1122" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-display text-base font-semibold text-mist">Ficou com alguma dúvida?</div>
              <p className="mt-1 text-xs text-mist-dim">Mande sua mensagem e respondemos no seu e-mail.</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Fechar" className="text-mist-faint hover:text-mist"><X size={18} /></button>
          </div>

          {sent ? (
            <div className="mt-5 text-center">
              <CheckCircle2 size={34} className="mx-auto text-neon" />
              <p className="mt-2 text-sm text-mist">Mensagem enviada!</p>
              <p className="mt-1 text-xs text-mist-dim">Vamos responder em {form.email || "seu e-mail"} o quanto antes.</p>
              <button onClick={() => setSent(false)} className="mt-4 text-xs font-semibold text-neon hover:underline">Enviar outra dúvida</button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <input value={form.name} onChange={set("name")} placeholder="Seu nome" maxLength={100}
                className="w-full rounded-lg border border-void-line bg-void-deep px-3 py-2.5 text-sm text-mist placeholder:text-mist-faint focus:border-neon/50 focus:outline-none" />
              <input value={form.email} onChange={set("email")} type="email" required placeholder="Seu e-mail (para a resposta)" maxLength={150}
                className="w-full rounded-lg border border-void-line bg-void-deep px-3 py-2.5 text-sm text-mist placeholder:text-mist-faint focus:border-neon/50 focus:outline-none" />
              <textarea value={form.message} onChange={set("message")} required minLength={5} maxLength={3000} rows={4} placeholder="Escreva sua dúvida"
                className="w-full resize-none rounded-lg border border-void-line bg-void-deep px-3 py-2.5 text-sm text-mist placeholder:text-mist-faint focus:border-neon/50 focus:outline-none" />
              {error && <p className="text-xs text-ember-soft">{error}</p>}
              <button type="submit" disabled={sending} className="btn-primary w-full !py-3">
                {sending ? <Loader2 size={16} className="animate-spin" /> : <><Send size={15} /> Enviar dúvida</>}
              </button>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center justify-center gap-1.5 text-xs text-mist-faint hover:text-mist">
                <Mail size={12} /> ou escreva para {SUPPORT_EMAIL}
              </a>
            </form>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Dúvidas"
        className={`ml-auto items-center gap-2 rounded-full bg-gradient-to-r from-neon to-volt px-4 py-3 font-display text-sm font-semibold text-void shadow-neon ${inDashboard && !open ? "hidden lg:flex" : "flex"}`}
      >
        {open ? <X size={18} /> : <MessageCircle size={18} />} {open ? "Fechar" : "Dúvidas?"}
      </button>
    </div>
  );
}
