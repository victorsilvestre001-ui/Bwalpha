export const dynamic = "force-dynamic";

// Versão publicada agora (commit do deploy na Vercel). O painel compara com a versão
// que ele carregou para se atualizar sozinho depois de um novo deploy.
export function GET() {
  return Response.json(
    { version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
