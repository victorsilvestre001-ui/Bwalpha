// Service worker do atalho (PWA) da Área do Cliente. Não guarda dados: tudo vem da internet.
// Só mostra um aviso amigável quando o aparelho está sem conexão (o cupom precisa da SEFAZ on-line).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (ev) => ev.waitUntil(self.clients.claim()));
const SEM_INTERNET = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sem internet</title>
<style>body{font:16px system-ui,sans-serif;background:#0b2545;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}button{font:inherit;margin-top:16px;padding:10px 18px;border:0;border-radius:10px;background:#c9a227;color:#0b2545;font-weight:700}</style></head>
<body><div><h1>Sem internet</h1><p>O cupom fiscal precisa de conexão para ser autorizado pela SEFAZ.<br>Confira o Wi-Fi ou os dados móveis e tente de novo.</p><button onclick="location.reload()">Tentar de novo</button></div></body></html>`;
self.addEventListener('fetch', (ev) => {
  if (ev.request.mode !== 'navigate') return;
  ev.respondWith(fetch(ev.request).catch(() => new Response(SEM_INTERNET, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
