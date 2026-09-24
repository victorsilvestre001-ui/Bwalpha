"use client";
import { useEffect, useRef, useState } from "react";
import { Send, ImagePlus, X, Bot, Loader2, Crown } from "lucide-react";
import { api } from "@/lib/api";
import { fileToPngBase64 } from "@/lib/image";
import ChatMarkdown from "./ChatMarkdown";

const SUGGESTIONS = ["Como está o EURUSD hoje?", "Explique o que é RSI de forma simples", "Qual a melhor gestão de risco para M1?"];

export default function ChatAssistant({ onUpgrade }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [image, setImage] = useState(null);
  const [sending, setSending] = useState(false);
  const [limit, setLimit] = useState(null);
  const [error, setError] = useState("");
  const endRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    api.chatHistory().then((h) => Array.isArray(h) && setMessages(h.map((m) => ({ role: m.role, text: m.message })))).catch(() => {});
    api.chatLimit().then(setLimit).catch(() => {});
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

  async function pickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { setImage(await fileToPngBase64(file)); } catch (err) { setError(err.message); }
  }

  async function send(text = input) {
    const msg = text.trim();
    if ((!msg && !image) || sending) return;
    setError("");
    setMessages((m) => [...m, { role: "user", text: msg || "[imagem enviada]", image: image?.dataUrl }]);
    setInput("");
    const img = image;
    setImage(null);
    setSending(true);
    try {
      const { reply } = await api.chat(msg || undefined, img?.base64);
      setMessages((m) => [...m, { role: "assistant", text: reply }]);
      api.chatLimit().then(setLimit).catch(() => {});
    } catch (err) {
      setError(err.message || "Erro ao consultar a IA.");
      if (err.status === 429) setLimit((l) => ({ ...(l || {}), remaining: 0 }));
    } finally {
      setSending(false);
    }
  }

  const blocked = limit && !limit.unlimited && limit.remaining === 0;

  return (
    <div className="panel panel-glow flex h-[calc(100vh-11rem)] flex-col overflow-hidden lg:h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between border-b border-void-line px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-neon to-volt"><Bot size={18} className="text-void" /></div>
          <div>
            <div className="font-display text-sm font-semibold text-mist">Assistente TradeOn AI</div>
            <div className="text-xs text-mist-faint">Especialista em trading · envia prints do gráfico</div>
          </div>
        </div>
        {limit && (
          <span className="rounded-full border border-void-line px-3 py-1 font-mono text-[11px] text-mist-dim">
            {limit.unlimited ? "Ilimitado" : `${limit.remaining}/3 hoje`}
          </span>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6">
        {messages.length === 0 && !sending && (
          <div className="mx-auto flex max-w-md flex-col items-center pt-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-void-line bg-void-deep"><Bot size={26} className="text-neon" /></div>
            <h3 className="mt-5 font-display text-lg font-semibold text-mist">Pergunte qualquer coisa sobre trading</h3>
            <p className="mt-1 text-sm text-mist-dim">A IA usa cotações e dados macro atualizados nas respostas.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={blocked} className="rounded-full border border-void-line bg-void-deep/60 px-3 py-1.5 text-xs text-mist-dim transition-colors hover:border-neon/40 hover:text-mist">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "user" ? (
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-neon/90 to-volt/90 px-4 py-3 text-sm leading-relaxed text-void">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m.image && <img src={m.image} alt="" className="mb-2 max-h-48 rounded-lg" />}
                {m.text}
              </div>
            ) : (
              <div className="flex max-w-[92%] gap-2.5">
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-neon to-volt"><Bot size={14} className="text-void" /></div>
                <div className="min-w-0 rounded-2xl rounded-tl-md border border-void-line bg-void-deep/70 px-4 py-3.5">
                  <ChatMarkdown text={m.text} />
                </div>
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-sm text-mist-faint"><Loader2 size={14} className="animate-spin text-neon" /> Preparando uma explicação completa…</div>
        )}
        <div ref={endRef} />
      </div>

      {error && <div className="mx-5 mb-3 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember-soft">{error}</div>}

      {blocked ? (
        <div className="border-t border-void-line p-5 text-center">
          <p className="text-sm text-mist-dim">Você usou as 3 mensagens gratuitas de hoje.</p>
          <button onClick={onUpgrade} className="btn-primary mt-3"><Crown size={16} /> Liberar IA ilimitada</button>
        </div>
      ) : (
        <div className="border-t border-void-line p-4">
          {image && (
            <div className="relative mb-3 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.dataUrl} alt="" className="h-16 rounded-lg border border-void-line" />
              <button onClick={() => setImage(null)} className="absolute -right-2 -top-2 rounded-full bg-void-card p-1 text-mist-dim hover:text-ember" aria-label="Remover imagem"><X size={12} /></button>
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border border-void-line p-3 text-mist-dim transition-colors hover:border-neon/40 hover:text-neon" aria-label="Anexar imagem">
              <ImagePlus size={18} />
            </button>
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Escreva sua pergunta…"
              className="input max-h-32 flex-1 resize-none"
            />
            <button type="submit" disabled={sending || (!input.trim() && !image)} className="btn-primary !p-3" aria-label="Enviar"><Send size={18} /></button>
          </form>
        </div>
      )}
    </div>
  );
}
