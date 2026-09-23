"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import MarketAnalyzer from "@/components/dashboard/MarketAnalyzer";
import ChatAssistant from "@/components/dashboard/ChatAssistant";
import EconomicCalendar from "@/components/dashboard/EconomicCalendar";
import Profile from "@/components/dashboard/Profile";
import { api, getSessionUser, clearSession } from "@/lib/api";

const TITLES = {
  analise: ["Análise de mercado", "Escolha o ativo e o timeframe e deixe a IA ler o gráfico."],
  assistente: ["Assistente IA", "Tire dúvidas e envie prints do seu gráfico."],
  calendario: ["Calendário econômico", "Próximos eventos que podem mexer com o mercado."],
  perfil: ["Perfil e plano", "Seus dados e sua assinatura."]
};

function Dashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("analise");
  const [upgrading, setUpgrading] = useState(false);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    const u = getSessionUser();
    if (!u) { router.replace("/auth"); return; }
    setUser(u);
    api.me().then((me) => setUser((cur) => ({ ...cur, ...me }))).catch((err) => {
      if (err.status === 401) { clearSession(); router.replace("/auth"); }
    });
  }, [router]);

  useEffect(() => {
    const vip = params.get("vip");
    if (vip === "success") setBanner({ ok: true, text: "Assinatura VIP ativada! Faça login novamente se o plano ainda não aparecer." });
    if (vip === "cancelled") setBanner({ ok: false, text: "Checkout cancelado. Você pode assinar quando quiser." });
    if (params.get("upgrade") === "1") setTab("perfil");
  }, [params]);

  function handleLogout() { clearSession(); router.replace("/auth"); }

  async function handleUpgrade() {
    setUpgrading(true);
    try { const { url } = await api.createCheckoutSession(); window.location.href = url; }
    catch { setUpgrading(false); }
  }

  if (!user) return null;
  const [title, subtitle] = TITLES[tab];
  const firstName = (user.name || "").split(" ")[0];

  return (
    <main className="relative min-h-screen bg-void font-body text-mist">
      <div className="aurora pointer-events-none fixed inset-0 opacity-60" />
      <Sidebar user={user} tab={tab} onChangeTab={setTab} onLogout={handleLogout} />

      <div className="relative px-4 pb-28 pt-6 md:px-8 lg:ml-64 lg:pb-10 lg:pt-8">
        {banner && (
          <div className={`mb-6 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${banner.ok ? "border-neon/30 bg-neon/10 text-neon" : "border-void-line bg-void-card text-mist-dim"}`}>
            <span className="flex items-center gap-2">{banner.ok && <CheckCircle2 size={16} />}{banner.text}</span>
            <button onClick={() => setBanner(null)} aria-label="Fechar"><X size={16} /></button>
          </div>
        )}

        <div className="mb-7">
          {tab === "analise" && <div className="font-mono text-xs uppercase tracking-widest text-neon">Olá, {firstName}</div>}
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-mist md:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-mist-dim">{subtitle}</p>
        </div>

        {tab === "analise" && <MarketAnalyzer />}
        {tab === "assistente" && <ChatAssistant onUpgrade={() => setTab("perfil")} />}
        {tab === "calendario" && <EconomicCalendar />}
        {tab === "perfil" && <Profile user={user} onUserChange={setUser} onUpgrade={handleUpgrade} upgrading={upgrading} />}
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
