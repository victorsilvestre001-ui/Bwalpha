/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Versão embutida no código do navegador, comparada com /api/version para auto-atualizar.
  env: { NEXT_PUBLIC_BUILD_VERSION: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev" },
  poweredByHeader: false,
  // Cabeçalhos de segurança em todas as páginas: bloqueia o site dentro de iframes de
  // terceiros (clickjacking), força HTTPS e limita o acesso a câmera/microfone/localização.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" }
        ]
      }
    ];
  },
  // Domínio antigo (bwalphaia.com) redireciona permanentemente para o novo, mantendo o caminho.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "(?:www\\.)?bwalphaia\\.com" }],
        destination: "https://www.tradeonia.com.br/:path*",
        permanent: true
      }
    ];
  }
};
