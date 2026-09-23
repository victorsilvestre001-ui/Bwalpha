/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Versão embutida no código do navegador, comparada com /api/version para auto-atualizar.
  env: { NEXT_PUBLIC_BUILD_VERSION: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev" }
};
