"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import Logo from "@/components/Logo";
import { api, setSession } from "@/lib/api";

function Field({ icon: Icon, children }) {
  return (
    <div className="relative">
      <Icon size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist-faint" />
      {children}
    </div>
  );
}

function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState("login");
  const [showPw, setShowPw] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const wantsVip = params.get("plan") === "vip";

  useEffect(() => {
    if (params.get("mode") === "register") setMode("register");
  }, [params]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email || !password || (mode === "register" && !name)) {
      setError("Preencha todos os campos para continuar.");
      return;
    }
    if (mode === "register" && password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    setLoading(true);
    try {
      const data = mode === "login" ? await api.login(email, password) : await api.register(name, email, password);
      setSession(data.token, data.user);
      router.push(wantsVip ? "/dashboard?upgrade=1" : "/dashboard");
    } catch (err) {
      setError(err.message || "Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <div className="panel panel-glow grad-border w-full max-w-md p-8 md:p-10">
      <div className="flex justify-center"><Logo size={36} /></div>

      <div className="mt-8 grid grid-cols-2 rounded-xl border border-void-line bg-void-deep/70 p-1">
        {["login", "register"].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(""); }}
            className={`relative rounded-lg py-2.5 font-display text-sm font-semibold transition-colors ${mode === m ? "text-void" : "text-mist-dim hover:text-mist"}`}
          >
            {mode === m && <motion.span layoutId="auth-tab" className="absolute inset-0 rounded-lg bg-gradient-to-r from-neon to-volt" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
            <span className="relative">{m === "login" ? "Entrar" : "Criar conta"}</span>
          </button>
        ))}
      </div>

      <h1 className="mt-8 font-display text-2xl font-bold text-mist">{isLogin ? "Bem-vindo de volta" : "Crie sua conta"}</h1>
      <p className="mt-1 text-sm text-mist-dim">{isLogin ? "Acesse seu painel TradeOn AI." : "Leva menos de um minuto. Sem cartão."}</p>

      <form onSubmit={handleSubmit} className="mt-7 space-y-3">
        <AnimatePresence initial={false}>
          {!isLogin && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <Field icon={User}>
                <input className="input !pl-11" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </Field>
            </motion.div>
          )}
        </AnimatePresence>
        <Field icon={Mail}>
          <input className="input !pl-11" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field icon={Lock}>
          <input
            className="input !pl-11 !pr-11"
            type={showPw ? "text" : "password"}
            placeholder={isLogin ? "Sua senha" : "Mínimo de 8 caracteres"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? "current-password" : "new-password"}
          />
          <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-mist-faint hover:text-mist" aria-label="Mostrar senha">
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </Field>

        {error && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember-soft">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary mt-2 w-full !py-3.5">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <>{isLogin ? "Entrar no painel" : "Criar minha conta"} <ArrowRight size={16} /></>}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-mist-faint">
        Ao continuar você concorda que as análises são ferramentas de apoio e não garantem resultado.
      </p>
    </div>
  );
}

export default function AuthPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-void px-5 py-16 font-body text-mist">
      <div className="aurora pointer-events-none absolute inset-0" />
      <div className="bg-grid pointer-events-none absolute inset-0" />
      <Link href="/" className="absolute left-5 top-5 z-10 flex items-center gap-2 text-sm text-mist-dim hover:text-mist md:left-8 md:top-8">
        <ArrowLeft size={16} /> Voltar
      </Link>
      <div className="relative z-10 flex w-full justify-center">
        <Suspense fallback={null}>
          <AuthForm />
        </Suspense>
      </div>
    </main>
  );
}
