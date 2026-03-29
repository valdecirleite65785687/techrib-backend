# Publicar Fase 2 no Render

## Objetivo

Publicar o backend OAuth da Fase 2 sem quebrar a Fase 1.

## O que o Render vai rodar

- Entrada: [`server.js`](/C:/backend-rainmaker/server.js)
- Start command: `npm start`

## Variaveis de ambiente recomendadas

- `BASE_URL`
  Use a URL publica do proprio Render.
  Exemplo: `https://techrib-backend.onrender.com`

- `RAINMAKER_BASE_URL`
  `https://api.rainmaker.espressif.com`

## Rotas importantes

- `/health`
- `/oauth/authorize`
- `/oauth/token`
- `/oauth/me`
- `/internal/rainmaker-session`

## Limitacao importante do modo atual

O armazenamento da Fase 2 ainda usa arquivo local:

- `data/oauth-store.json`

No Render gratuito, esse arquivo pode ser perdido em restart, deploy ou troca de instancia.
Isso e aceitavel para validacao inicial, mas nao para producao.

## Proximo passo depois do deploy

1. Confirmar que `https://SEU-RENDER/health` responde `{"ok":true}`
2. Testar `authorize` na URL publica
3. Atualizar `Account Linking` da skill para usar a URL publica
4. Depois trocar armazenamento local por DynamoDB
