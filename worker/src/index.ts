// gition auth worker — exchanges OAuth codes / refresh tokens with GitHub,
// keeping the GitHub App's client_secret out of the browser. Stateless.
//
// Routes:
//   POST /oauth/exchange  { code }          → GitHub token JSON
//   POST /oauth/refresh   { refresh_token } → GitHub token JSON

export interface Env {
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  ALLOWED_ORIGINS: string
}

const GH_TOKEN_URL = 'https://github.com/login/oauth/access_token'

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const origin = req.headers.get('Origin')
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim())
    const corsOrigin = origin && allowed.includes(origin) ? origin : ''

    if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), corsOrigin)

    if (url.pathname === '/oauth/exchange' && req.method === 'POST') {
      return cors(await exchange(req, env), corsOrigin)
    }
    if (url.pathname === '/oauth/refresh' && req.method === 'POST') {
      return cors(await refresh(req, env), corsOrigin)
    }
    return cors(new Response('Not found', { status: 404 }), corsOrigin)
  },
}

async function exchange(req: Request, env: Env): Promise<Response> {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string }
  if (!code) return json({ error: 'missing code' }, 400)
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    code,
  })
  return forward(params)
}

async function refresh(req: Request, env: Env): Promise<Response> {
  const { refresh_token } = (await req.json().catch(() => ({}))) as {
    refresh_token?: string
  }
  if (!refresh_token) return json({ error: 'missing refresh_token' }, 400)
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    client_secret: env.GITHUB_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token,
  })
  return forward(params)
}

async function forward(params: URLSearchParams): Promise<Response> {
  const res = await fetch(GH_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const body = await res.text()
  return new Response(body, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function cors(res: Response, origin: string): Response {
  const h = new Headers(res.headers)
  if (origin) h.set('Access-Control-Allow-Origin', origin)
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  h.set('Access-Control-Allow-Headers', 'Content-Type')
  h.set('Vary', 'Origin')
  return new Response(res.body, { status: res.status, headers: h })
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
