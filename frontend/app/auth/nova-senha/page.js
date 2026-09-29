"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, Eye, EyeOff, ArrowRight, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import Logo from "@/components/Logo";
import { api } from "@/lib/api";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [doneEmail, setDoneEmail] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("A senha deve ter pelo menos 8 caracteres."); return; }
    if (password !== confirm) { setError("As duas senhas não são iguais."); return; }
    setLoading(true);
    try {
      const r = await api.resetPassword(token, password);
      setDoneEmail(r?.email || "");
    } catch (err) {
      setError(err.message || "Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel panel-glow grad-border w-full max-w-md p-8 md:p-10">
      <div className="flex justify-center"><Logo size={36} /></div>
      {doneEmail !== null ? (
        <>
          <div className="mt-8 flex justify-center text-neon"><CheckCircle2 size={40} /></div>
          <h1 className="mt-4 text-center font-display text-2xl font-bold text-mist">Senha alterada!</h1>
          <p className="mt-2 text-center text-sm text-mist-dim">
            Agora é só entrar{doneEmail ? <> com o e-mail <strong className="text-mist">{doneEmail}</strong></> : null} e a nova senha.
          </p>
          <Link href="/auth" className="btn-primary mt-7 w-full !py-3.5">Entrar no painel <ArrowRight size={16} /></Link>
        </>
      ) : !token ? (
        <>
          <h1 className="mt-8 font-display text-2xl font-bold text-mist">Link inválido</h1>
          <p className="mt-2 text-sm text-mist-dim">Abra o link direto do e-mail ou peça um novo em &quot;Esqueci minha senha&quot;.</p>
          <Link href="/auth" className="btn-primary mt-7 w-full !py-3.5">Voltar para o login</Link>
        </>
      ) : (
        <>
          <h1 className="mt-8 font-display text-2xl font-bold text-mist">Crie uma nova senha</h1>
          <p className="mt-1 text-sm text-mist-dim">Mínimo de 8 caracteres.</p>
          <form onSubmit={handleSubmit} className="mt-7 space-y-3">
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist-faint" />
              <input className="input !pl-11 !pr-11" type={showPw ? "text" : "password"} placeholder="Nova senha" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-mist-faint hover:text-mist" aria-label="Mostrar senha">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist-faint" />
              <input className="input !pl-11" type={showPw ? "text" : "password"} placeholder="Repita a nova senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
            {error && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember-soft">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary mt-2 w-full !py-3.5">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <>Salvar nova senha <ArrowRight size={16} /></>}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function NovaSenhaPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-void px-5 py-16 font-body text-mist">
      <div className="aurora pointer-events-none absolute inset-0" />
      <div className="bg-grid pointer-events-none absolute inset-0" />
      <Link href="/auth" className="absolute left-5 top-5 z-10 flex items-center gap-2 text-sm text-mist-dim hover:text-mist md:left-8 md:top-8">
        <ArrowLeft size={16} /> Voltar
      </Link>
      <div className="relative z-10 flex w-full justify-center">
        <Suspense fallback={null}>
          <ResetForm />
        </Suspense>
      </div>
    </main>
  );
}
