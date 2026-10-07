// Rastreamento de anúncios (Meta Pixel e Google Ads). Nada é carregado antes de a
// pessoa aceitar os cookies de marketing, e nada roda se os IDs não estiverem configurados.
// IDs públicos dos Pixels da Meta: "TradeOn AI Site" e o da conta de anúncios 1699797761329078.
// Podem ser trocados pela variável de ambiente (separados por vírgula). O fbq("track") manda para todos.
const META_PIXEL_IDS = (process.env.NEXT_PUBLIC_META_PIXEL_ID || "1856706728826047,2784557928605608")
  .split(",").map((id) => id.trim()).filter(Boolean);
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "AW-18498114373"; // tag do Google Ads da TradeOn
const GADS_LABELS = {
  CompleteRegistration: process.env.NEXT_PUBLIC_GADS_SIGNUP_LABEL || "AdzKCJvcuJQdEMWmy_RE", // conversão "Inscrição" (07/10)
  InitiateCheckout: process.env.NEXT_PUBLIC_GADS_CHECKOUT_LABEL || "",
  Purchase: process.env.NEXT_PUBLIC_GADS_PURCHASE_LABEL || ""
};

export const CONSENT_KEY = "tradeon_consent"; // "all" | "essential"
export const trackingConfigured = Boolean(META_PIXEL_IDS.length || GOOGLE_ADS_ID);

export function getConsent() {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
}

export function setConsent(value) {
  try { localStorage.setItem(CONSENT_KEY, value); } catch {}
  if (value === "all") loadTrackers();
}

// Correspondência avançada da Meta: e-mail e id da conta (o Pixel criptografa com SHA-256
// no navegador antes de enviar). Melhora a qualidade da correspondência dos eventos.
let userData = null;
export function identify(user) {
  if (!user?.email) return;
  const next = { em: String(user.email).trim().toLowerCase(), ...(user.id ? { external_id: String(user.id) } : {}) };
  if (userData && userData.em === next.em) return;
  userData = next;
  if (loaded && window.fbq) {
    for (const id of META_PIXEL_IDS) { try { window.fbq("init", id, userData); } catch {} }
  }
}

let loaded = false;
function addScript(src) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

// Tag do Google em modo de consentimento: carrega em toda página (o Google precisa detectá-la),
// mas com cookies e anúncios negados até a pessoa aceitar no aviso de cookies (LGPD).
let googleBase = false;
export function initGoogleTag() {
  if (googleBase || typeof window === "undefined" || !GOOGLE_ADS_ID) return;
  googleBase = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  const granted = getConsent() === "all" ? "granted" : "denied";
  window.gtag("consent", "default", { ad_storage: granted, ad_user_data: granted, ad_personalization: granted, analytics_storage: granted });
  addScript(`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`);
  window.gtag("js", new Date());
  window.gtag("config", GOOGLE_ADS_ID);
}

export function loadTrackers() {
  if (loaded || typeof window === "undefined" || getConsent() !== "all") return;
  loaded = true;

  if (META_PIXEL_IDS.length && !window.fbq) {
    const fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
    fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = [];
    window.fbq = fbq; window._fbq = fbq;
    addScript("https://connect.facebook.net/en_US/fbevents.js");
    for (const id of META_PIXEL_IDS) window.fbq("init", id, userData || undefined);
    window.fbq("track", "PageView");
  }

  if (GOOGLE_ADS_ID) {
    initGoogleTag();
    window.gtag("consent", "update", { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "granted" });
  }
}

// Eventos: CompleteRegistration (cadastro), InitiateCheckout (clique em assinar), Purchase (assinatura concluída)
// O Google Ads recebe a conversão sempre: a tag roda no modo de consentimento (sem cookies quando a
// pessoa não aceitou) e o Google só modela a conversão. O Pixel da Meta continua só com consentimento.
export function track(event, params = {}) {
  if (typeof window === "undefined") return;
  const label = GADS_LABELS[event];
  if (GOOGLE_ADS_ID && label) {
    initGoogleTag();
    try { window.gtag?.("event", "conversion", { send_to: `${GOOGLE_ADS_ID}/${label}`, ...params }); } catch {}
  }
  if (getConsent() !== "all") return;
  loadTrackers();
  try { window.fbq?.("track", event, params); } catch {}
}
