"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Crown, Loader2, Check, Settings2 } from "lucide-react";
import { api, updateSessionUser } from "@/lib/api";
import { fileToAvatarDataUrl } from "@/lib/image";
import { Avatar, isPaid } from "./Sidebar";

function formatCpf(v = "") {
  const d = String(v).replace(/\D/g, "").slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export default function Profile({ user, onUserChange, onUpgrade, upgrading }) {
  const [cpf, setCpf] = useState(formatCpf(user?.cpf || ""));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.me().then((me) => {
      const u = updateSessionUser(me);
      onUserChange(u);
      setCpf(formatCpf(me.cpf || ""));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(patch) {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const updated = await api.updateProfile(patch);
      onUserChange(updateSessionUser(updated));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function pickAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { await save({ avatar: await fileToAvatarDataUrl(file) }); } catch (err) { setError(err.message); }
  }

  async function openPortal() {
    setPortalLoading(true);
    try { const { url } = await api.createPortalSession(); window.location.href = url; }
    catch (err) { setError(err.message); setPortalLoading(false); }
  }

  const paid = isPaid(user);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="panel panel-glow p-6 md:p-8">
        <h2 className="font-display text-lg font-semibold text-mist">Seu perfil</h2>
        <div className="mt-6 flex items-center gap-5">
          <div className="relative">
            <Avatar user={user} size={80} />
            <button onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 rounded-full border border-void-line bg-void-card p-2 text-mist-dim transition-colors hover:text-neon" aria-label="Trocar foto">
              <Camera size={14} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickAvatar} />
          </div>
          <div>
            <div className="font-display text-xl font-semibold text-mist">{user?.name}</div>
            <div className="text-sm text-mist-dim">{user?.email}</div>
          </div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); save({ cpf }); }} className="mt-8 max-w-sm">
          <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-mist-faint">CPF</label>
          <div className="flex gap-2">
            <input className="input" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
            <button type="submit" disabled={saving} className="btn-primary !px-5">
              {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : "Salvar"}
            </button>
          </div>
        </form>
        {error && <p className="mt-4 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember-soft">{error}</p>}
      </div>

      <div className={`panel relative overflow-hidden p-6 md:p-8 ${paid ? "" : "grad-border shadow-neon"}`}>
        <div className="aurora pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative">
          <div className="font-mono text-[10px] uppercase tracking-widest text-mist-faint">Plano atual</div>
          <div className="mt-2 flex items-center gap-2 font-display text-2xl font-bold">
            <Crown size={22} className={paid ? "text-neon" : "text-mist-faint"} />
            <span className={paid ? "grad-text" : "text-mist"}>{(user?.plan || "free").toUpperCase()}</span>
          </div>
          {paid ? (
            <>
              <p className="mt-3 text-sm text-mist-dim">Você tem acesso completo à TradeOn AI.</p>
              {user?.plan === "vip" && (
                <button onClick={openPortal} disabled={portalLoading} className="btn-ghost mt-6 w-full">
                  {portalLoading ? <Loader2 size={16} className="animate-spin" /> : <><Settings2 size={16} /> Gerenciar assinatura</>}
                </button>
              )}
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-mist-dim">Desbloqueie o assistente de IA ilimitado, análise de prints e o histórico de sinais.</p>
              <button onClick={onUpgrade} disabled={upgrading} className="btn-primary mt-6 w-full !py-3.5">
                {upgrading ? <Loader2 size={16} className="animate-spin" /> : <><Crown size={16} /> Assinar VIP</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
