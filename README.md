# BWAlpha AI — Backend

## Setup

1. Instalar dependências:
```
npm install
```

2. Copiar `.env.example` para `.env` e preencher com suas credenciais reais.

3. Criar o banco no Railway (ou local) e rodar o schema:
```
psql $DATABASE_URL -f schema.sql
```

4. Rodar em desenvolvimento:
```
npm run dev
```

## Rotas principais

- `POST /api/auth/register` — cria usuário
- `POST /api/auth/login` — login, retorna token JWT
- `POST /api/signals/webhook` — recebe sinal do TradingView (header `x-webhook-secret`)
- `GET /api/signals` — lista sinais (requer login + plano pago)
- `GET /api/signals/stats` — estatísticas (win rate, pips)
- `PATCH /api/signals/:id/close` — fecha um sinal com resultado
- `POST /api/chat` — envia mensagem (+ imagem opcional) para a IA de trading
- `GET /api/chat/history` — histórico de conversa do usuário
- `GET /api/calendar` — próximos eventos econômicos
- `POST /api/calendar/sync` — popula calendário via cron job externo

## Próximos passos

- Configurar webhook do TradingView apontando pra `/api/signals/webhook`
- Configurar um cron job (ex: node-cron ou Railway cron) pra chamar `/api/calendar/sync` diariamente, puxando de uma API de calendário econômico
- Conectar Hotmart/Stripe: ao receber evento de compra, atualizar `plan` e `subscription_status` do usuário
- Deploy: Railway (backend + Postgres) + Vercel (frontend Next.js)
