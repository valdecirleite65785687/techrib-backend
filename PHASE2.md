# Fase 2

Esta fase prepara o projeto para sair de uma conta RainMaker fixa e evoluir para multiusuario.

## O que foi implementado agora

- Backend OAuth de desenvolvimento em [`server.js`](/C:/backend-rainmaker/server.js)
- Armazenamento local em arquivo em `data/oauth-store.json`
- Tela simples de login RainMaker em `/oauth/authorize`
- Troca de `authorization_code` por token em `/oauth/token`
- Endpoint auxiliar `/oauth/me` para inspecionar o usuario vinculado ao token

## Fluxo atual

1. Alexa abre `/oauth/authorize`
2. Usuario entra com e-mail e senha RainMaker
3. Backend valida no RainMaker com `POST /v1/login2`
4. Backend salva o vinculo localmente
5. Alexa troca o `code` em `/oauth/token`

## Limite atual

- O armazenamento e local, pensado para desenvolvimento
- Ainda nao integra a Lambda da skill com os tokens por usuario
- Ainda nao substitui a Fase 1 em producao

## Proximo passo recomendado

1. Publicar esse backend
2. Apontar o `Account Linking` da skill para ele
3. Adaptar a Lambda da skill para resolver o usuario a partir do token da Alexa
4. Trocar o armazenamento local por DynamoDB
