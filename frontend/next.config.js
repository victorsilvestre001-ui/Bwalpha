/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Versão embutida no código do navegador, comparada com /api/version para auto-atualizar.
  env: { NEXT_PUBLIC_BUILD_VERSION: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev" },
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
