# TradeOn AI — Frontend

Novo frontend (Next.js 14 + Tailwind) da TradeOn AI, substituindo o antigo `bwalpha-next`.
Usa o mesmo backend (Railway) e as mesmas rotas `/api/*` deste repositório.

## Rodar localmente

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

A URL da API pode ser trocada com a variável `NEXT_PUBLIC_API_URL`
(padrão: `https://bwalpha-api-production.up.railway.app`).

## Publicar no domínio atual (bwalphaia.com)

```bash
cd frontend
npx vercel link      # escolha o projeto "bwalpha-next"
npx vercel --prod
```

Ou, na Vercel, conecte o projeto `bwalpha-next` a este repositório com **Root Directory = `frontend`**.
