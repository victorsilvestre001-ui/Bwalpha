// Rastreamento de anúncios (Meta Pixel e Google Ads). Nada é carregado antes de a
// pessoa aceitar os cookies de marketing, e nada roda se os IDs não estiverem configurados.
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";
const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || ""; // formato AW-XXXXXXXXX
const GADS_LABELS = {
  CompleteRegistration: process.env.NEXT_PUBLIC_GADS_SIGNUP_LABEL || "",
  InitiateCheckout: process.env.NEXT_PUBLIC_GADS_CHECKOUT_LABEL || "",
  Purchase: process.env.NEXT_PUBLIC_GADS_PURCHASE_LABEL || ""
};

export const CONSENT_KEY = "tradeon_consent"; // "all" | "essential"
export const trackingConfigured = Boolean(META_PIXEL_ID || GOOGLE_ADS_ID);

export function getConsent() {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
}

export function setConsent(value) {
  try { localStorage.setItem(CONSENT_KEY, value); } catch {}
  if (value === "all") loadTrackers();
}

let loaded = false;
function addScript(src) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

export function loadTrackers() {
  if (loaded || typeof window === "undefined" || getConsent() !== "all") return;
  loaded = true;

  if (META_PIXEL_ID && !window.fbq) {
    const fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
    fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = [];
    window.fbq = fbq; window._fbq = fbq;
    addScript("https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", META_PIXEL_ID);
    window.fbq("track", "PageView");
  }

  if (GOOGLE_ADS_ID && !window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    addScript(`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`);
    window.gtag("js", new Date());
    window.gtag("config", GOOGLE_ADS_ID);
  }
}

// Eventos: CompleteRegistration (cadastro), InitiateCheckout (clique em assinar), Purchase (assinatura concluída)
export function track(event, params = {}) {
  if (typeof window === "undefined" || getConsent() !== "all") return;
  loadTrackers();
  try { window.fbq?.("track", event, params); } catch {}
  const label = GADS_LABELS[event];
  if (GOOGLE_ADS_ID && label) {
    try { window.gtag?.("event", "conversion", { send_to: `${GOOGLE_ADS_ID}/${label}`, ...params }); } catch {}
  }
}
