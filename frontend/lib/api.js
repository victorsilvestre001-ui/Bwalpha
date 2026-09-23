export const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://bwalpha-api-production.up.railway.app";

// Mantém as mesmas chaves da versão anterior para não deslogar quem já estava logado.
const TOKEN_KEY = "bwalpha_token";
const USER_KEY = "bwalpha_user";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getSessionUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function updateSessionUser(patch) {
  const updated = { ...(getSessionUser() || {}), ...patch };
  localStorage.setItem(USER_KEY, JSON.stringify(updated));
  return updated;
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const error = new Error(data?.error || `Erro ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  register: (name, email, password) => request("/api/auth/register", { method: "POST", body: { name, email, password }, auth: false }),
  login: (email, password) => request("/api/auth/login", { method: "POST", body: { email, password }, auth: false }),
  me: () => request("/api/auth/me"),
  updateProfile: (patch) => request("/api/auth/profile", { method: "PATCH", body: patch }),
  publicQuotes: () => request("/api/market/public-quotes", { auth: false }),
  marketStatus: () => request("/api/market/status", { auth: false }),
  serverTime: () => request("/api/market/time", { auth: false }),
  signal: (pair, timeframe) => request("/api/market/signal", { method: "POST", body: { pair, timeframe } }),
  calendar: () => request("/api/calendar"),
  chat: (message, image_base64) => request("/api/chat", { method: "POST", body: { message, image_base64 } }),
  chatHistory: () => request("/api/chat/history"),
  chatLimit: () => request("/api/chat/limit"),
  createCheckoutSession: () => request("/api/checkout/create-session", { method: "POST" }),
  createPortalSession: () => request("/api/checkout/portal-session", { method: "POST" })
};
