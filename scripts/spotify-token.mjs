/**
 * npm run spotify-token
 *
 * Saca el refresh token de TU cuenta de Spotify para /api/now (lo que estás
 * escuchando). Se corre una vez, en local:
 *
 *   1. En developer.spotify.com/dashboard, en la app de este proyecto, añadí
 *      como Redirect URI:  http://127.0.0.1:8888/callback
 *   2. npm run spotify-token  y abrí el enlace que imprime.
 *   3. Aceptá. La terminal imprime SPOTIFY_REFRESH_TOKEN=...; ponelo en
 *      .env.local y en las variables del proyecto en Vercel.
 *
 * Lee SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET de .env.local. El token no
 * caduca mientras no revoques el acceso a la app desde tu cuenta.
 */
import fs from 'node:fs';
import http from 'node:http';
import crypto from 'node:crypto';

for (const name of ['.env.local', '.env']) {
  if (!fs.existsSync(name)) continue;
  for (const line of fs.readFileSync(name, 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0 && !line.trim().startsWith('#')) {
      const key = line.slice(0, eq).trim();
      if (!(key in process.env)) process.env[key] = line.slice(eq + 1).trim();
    }
  }
}

const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
  console.error('Faltan SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET en .env.local.');
  process.exit(1);
}

const REDIRECT = 'http://127.0.0.1:8888/callback';
const state = crypto.randomBytes(12).toString('hex');
const authorize = new URL('https://accounts.spotify.com/authorize');
authorize.search = new URLSearchParams({
  client_id: id,
  response_type: 'code',
  redirect_uri: REDIRECT,
  scope: 'user-read-currently-playing user-read-recently-played',
  state,
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  if (url.pathname !== '/callback') return res.writeHead(404).end();
  if (url.searchParams.get('state') !== state) return res.writeHead(400).end('state no coincide');

  const code = url.searchParams.get('code');
  if (!code) {
    res.end('Cancelado.');
    server.close();
    return;
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT }),
  });
  const json = await response.json();

  if (!json.refresh_token) {
    res.end('Spotify no devolvió el token. Mirá la terminal.');
    console.error(json);
  } else {
    res.end('Listo. Volvé a la terminal.');
    console.log(`\nSPOTIFY_REFRESH_TOKEN=${json.refresh_token}\n`);
  }
  server.close();
});

server.listen(8888, '127.0.0.1', () => {
  console.log('Abrí este enlace y aceptá:\n');
  console.log(authorize.toString());
});
