import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import axios from "axios";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const RAINMAKER_BASE_URL =
  (process.env.RAINMAKER_BASE_URL || "https://api.rainmaker.espressif.com").replace(/\/$/, "");
const STORE_DIR = path.join(__dirname, "data");
const STORE_PATH = path.join(STORE_DIR, "oauth-store.json");
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_SEC = 60 * 60;
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function randomToken(prefix) {
  return `${prefix}_${crypto.randomBytes(24).toString("hex")}`;
}

async function ensureStore() {
  await mkdir(STORE_DIR, { recursive: true });

  try {
    await readFile(STORE_PATH, "utf8");
  } catch {
    const initial = {
      authCodes: [],
      accessTokens: [],
      refreshTokens: [],
      users: [],
    };
    await writeFile(STORE_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

async function loadStore() {
  await ensureStore();
  const raw = await readFile(STORE_PATH, "utf8");
  return JSON.parse(raw);
}

async function saveStore(store) {
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

function cleanupStore(store) {
  const now = Date.now();
  store.authCodes = store.authCodes.filter((item) => item.expiresAt > now && !item.usedAt);
  store.accessTokens = store.accessTokens.filter((item) => item.expiresAt > now);
  store.refreshTokens = store.refreshTokens.filter((item) => item.expiresAt > now);
  return store;
}

function renderAuthorizePage({ query, error = "", defaultUserName = "" }) {
  const hiddenFields = Object.entries(query)
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(String(value ?? ""))}">`
    )
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vincular conta | Techrib</title>
  <style>
    :root {
      --bg: #f4f7fb;
      --card: #ffffff;
      --text: #172033;
      --muted: #667085;
      --accent: #0f766e;
      --border: #d7deea;
      --error: #b42318;
      --error-bg: #fef3f2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Tahoma, sans-serif;
      background: radial-gradient(circle at top, #e8f7f1 0%, var(--bg) 40%);
      color: var(--text);
    }
    main {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(100%, 460px);
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 28px;
      box-shadow: 0 24px 60px rgba(16, 24, 40, 0.10);
    }
    h1 { margin: 0 0 8px; font-size: 1.9rem; }
    p { color: var(--muted); margin: 0 0 20px; }
    label {
      display: block;
      margin: 16px 0 8px;
      font-weight: 600;
      font-size: 0.95rem;
    }
    input {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 12px;
      font-size: 1rem;
    }
    button {
      width: 100%;
      margin-top: 20px;
      padding: 12px 16px;
      border: 0;
      border-radius: 12px;
      background: var(--accent);
      color: white;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
    }
    .error {
      margin-bottom: 16px;
      padding: 12px 14px;
      border-radius: 12px;
      color: var(--error);
      background: var(--error-bg);
      border: 1px solid #fecdca;
    }
    .meta {
      margin-top: 16px;
      font-size: 0.92rem;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <main>
    <section class="card">
      <h1>Vincular Conta RainMaker</h1>
      <p>Entre com sua conta RainMaker para conectar a sua skill Alexa aos seus dispositivos.</p>
      ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
      <form method="post" action="/oauth/authorize">
        ${hiddenFields}
        <label for="username">E-mail RainMaker</label>
        <input id="username" name="username" type="email" autocomplete="username" required value="${escapeHtml(
          defaultUserName
        )}">

        <label for="password">Senha RainMaker</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>

        <button type="submit">Vincular Conta</button>
      </form>
      <div class="meta">Fase 2 em modo de desenvolvimento. Armazenamento local em arquivo.</div>
    </section>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function validateAuthorizeQuery(query) {
  const required = ["client_id", "redirect_uri", "response_type", "state"];
  for (const key of required) {
    if (!query[key]) {
      return `Missing required parameter: ${key}`;
    }
  }

  if (query.response_type !== "code") {
    return "Only response_type=code is supported.";
  }

  return null;
}

async function rainmakerLogin(username, password) {
  const response = await axios.post(
    `${RAINMAKER_BASE_URL}/v1/login2`,
    { user_name: username, password },
    {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    }
  );

  const data = response.data;
  const accessToken = data.accesstoken || data.access_token;
  const refreshToken = data.refreshtoken || data.refresh_token;
  const idToken = data.idtoken || data.id_token;

  if (!accessToken) {
    throw new Error("RainMaker login succeeded without access token.");
  }

  return { accessToken, refreshToken, idToken };
}

function tokenResponse({ accessToken, refreshToken }) {
  return {
    token_type: "bearer",
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: ACCESS_TOKEN_TTL_SEC,
  };
}

app.get("/", (_req, res) => {
  res.json({
    name: "Techrib RainMaker OAuth Backend",
    phase: "phase-2-dev",
    endpoints: ["/oauth/authorize", "/oauth/token", "/oauth/me"],
    rainmaker_base_url: RAINMAKER_BASE_URL,
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/oauth/authorize", async (req, res) => {
  const error = validateAuthorizeQuery(req.query);
  if (error) {
    return res.status(400).send(renderAuthorizePage({ query: req.query, error }));
  }

  res.send(renderAuthorizePage({ query: req.query }));
});

app.post("/oauth/authorize", async (req, res) => {
  const error = validateAuthorizeQuery(req.body);
  if (error) {
    return res.status(400).send(renderAuthorizePage({ query: req.body, error }));
  }

  const { client_id, redirect_uri, state, scope = "", username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .send(renderAuthorizePage({ query: req.body, error: "Informe e-mail e senha.", defaultUserName: username }));
  }

  try {
    const rainmakerTokens = await rainmakerLogin(username, password);
    const store = cleanupStore(await loadStore());
    const userId = crypto.createHash("sha256").update(username.toLowerCase()).digest("hex");
    const authCode = randomToken("code");
    const now = Date.now();

    store.users = store.users.filter((user) => user.userId !== userId);
    store.users.push({
      userId,
      rainmakerUserName: username,
      rainmakerAccessToken: rainmakerTokens.accessToken,
      rainmakerRefreshToken: rainmakerTokens.refreshToken || null,
      rainmakerIdToken: rainmakerTokens.idToken || null,
      updatedAt: now,
    });

    store.authCodes.push({
      code: authCode,
      clientId: client_id,
      redirectUri: redirect_uri,
      scope,
      state,
      userId,
      createdAt: now,
      expiresAt: now + AUTH_CODE_TTL_MS,
      usedAt: null,
    });

    await saveStore(store);

    const redirect = new URL(redirect_uri);
    redirect.searchParams.set("code", authCode);
    redirect.searchParams.set("state", state);
    return res.redirect(302, redirect.toString());
  } catch (err) {
    const message =
      err.response?.data?.description ||
      err.response?.data?.message ||
      "Nao foi possivel autenticar no RainMaker com essas credenciais.";

    return res
      .status(401)
      .send(renderAuthorizePage({ query: req.body, error: message, defaultUserName: username }));
  }
});

app.post("/oauth/token", async (req, res) => {
  const { grant_type } = req.body;
  const store = cleanupStore(await loadStore());
  const now = Date.now();

  if (grant_type === "authorization_code") {
    const { code, client_id, redirect_uri } = req.body;
    const authCode = store.authCodes.find((item) => item.code === code);

    if (!authCode) {
      return res.status(400).json({ error: "invalid_grant", error_description: "Authorization code not found." });
    }

    if (authCode.usedAt || authCode.expiresAt <= now) {
      return res.status(400).json({ error: "invalid_grant", error_description: "Authorization code expired." });
    }

    if (authCode.clientId !== client_id || authCode.redirectUri !== redirect_uri) {
      return res.status(400).json({ error: "invalid_grant", error_description: "Authorization code mismatch." });
    }

    const accessToken = randomToken("atk");
    const refreshToken = randomToken("rtk");

    authCode.usedAt = now;
    store.accessTokens.push({
      token: accessToken,
      userId: authCode.userId,
      clientId: authCode.clientId,
      scope: authCode.scope,
      createdAt: now,
      expiresAt: now + ACCESS_TOKEN_TTL_SEC * 1000,
    });
    store.refreshTokens.push({
      token: refreshToken,
      userId: authCode.userId,
      clientId: authCode.clientId,
      scope: authCode.scope,
      createdAt: now,
      expiresAt: now + REFRESH_TOKEN_TTL_SEC * 1000,
    });

    await saveStore(store);
    return res.json(tokenResponse({ accessToken, refreshToken }));
  }

  if (grant_type === "refresh_token") {
    const { refresh_token, client_id } = req.body;
    const refreshToken = store.refreshTokens.find((item) => item.token === refresh_token);

    if (!refreshToken || refreshToken.expiresAt <= now || refreshToken.clientId !== client_id) {
      return res.status(400).json({ error: "invalid_grant", error_description: "Refresh token invalid." });
    }

    const accessToken = randomToken("atk");
    store.accessTokens.push({
      token: accessToken,
      userId: refreshToken.userId,
      clientId: refreshToken.clientId,
      scope: refreshToken.scope,
      createdAt: now,
      expiresAt: now + ACCESS_TOKEN_TTL_SEC * 1000,
    });

    await saveStore(store);
    return res.json(tokenResponse({ accessToken, refreshToken: refreshToken.token }));
  }

  return res.status(400).json({ error: "unsupported_grant_type" });
});

app.get("/oauth/me", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";

  if (!token) {
    return res.status(401).json({ error: "missing_token" });
  }

  const store = cleanupStore(await loadStore());
  const accessToken = store.accessTokens.find((item) => item.token === token);

  if (!accessToken || accessToken.expiresAt <= Date.now()) {
    return res.status(401).json({ error: "invalid_token" });
  }

  const user = store.users.find((item) => item.userId === accessToken.userId);
  if (!user) {
    return res.status(404).json({ error: "user_not_found" });
  }

  return res.json({
    user_id: user.userId,
    rainmaker_user_name: user.rainmakerUserName,
    linked_at: user.updatedAt,
  });
});

app.get("/internal/rainmaker-session", async (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";

  if (!token) {
    return res.status(401).json({ error: "missing_token" });
  }

  const store = cleanupStore(await loadStore());
  const accessToken = store.accessTokens.find((item) => item.token === token);

  if (!accessToken || accessToken.expiresAt <= Date.now()) {
    return res.status(401).json({ error: "invalid_token" });
  }

  const user = store.users.find((item) => item.userId === accessToken.userId);
  if (!user) {
    return res.status(404).json({ error: "user_not_found" });
  }

  return res.json({
    user_id: user.userId,
    rainmaker_user_name: user.rainmakerUserName,
    rainmaker_access_token: user.rainmakerAccessToken,
    rainmaker_refresh_token: user.rainmakerRefreshToken,
    rainmaker_id_token: user.rainmakerIdToken,
    linked_at: user.updatedAt,
  });
});

app.listen(PORT, async () => {
  await ensureStore();
  console.log(`OAuth backend listening on ${BASE_URL}`);
});
