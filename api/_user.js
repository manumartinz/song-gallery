/**
 * Cliente de la Web API con MI cuenta, no con el catálogo.
 *
 * Usa el refresh token de SPOTIFY_REFRESH_TOKEN (se saca una vez con
 * `npm run spotify-token`). Lo comparten /api/now, /api/mine y el script de
 * recomendaciones. Vivía dentro de now.js hasta que hubo más de uno.
 *
 * Al renovar, Spotify contesta también con los permisos que tiene el token.
 * Se guardan con él: así /api/mine sabe qué fuentes puede ofrecer sin tener que
 * probarlas y fallar.
 */
import { SpotifyError } from './_spotify.js';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

let cached = null; // { value, expiresAt, scopes }

export function userConfigured() {
  return Boolean(process.env.SPOTIFY_REFRESH_TOKEN);
}

async function refresh() {
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret } = process.env;
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
    }),
  });
  if (!response.ok) throw new SpotifyError(`token ${response.status}`, 502);

  const json = await response.json();
  cached = {
    value: json.access_token,
    // 30 s de margen para no usar un token que caduque a mitad de peticion.
    expiresAt: Date.now() + json.expires_in * 1000 - 30_000,
    scopes: new Set(String(json.scope || '').split(' ').filter(Boolean)),
  };
  return cached;
}

async function current() {
  return cached && cached.expiresAt > Date.now() ? cached : refresh();
}

export async function userToken() {
  return (await current()).value;
}

/** Los permisos que tiene el token, como Set. */
export async function userScopes() {
  return (await current()).scopes;
}

/**
 * Petición autenticada con mi cuenta. Acepta ruta o URL absoluta.
 *
 * Devuelve el JSON, o null en un 204 (nada sonando, por ejemplo). Un 403 es
 * casi siempre un permiso que el token no tiene: se dice cuál es el arreglo.
 */
export async function userFetch(pathOrUrl, { method = 'GET', body, retries = 1 } = {}) {
  const token = await userToken();
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : API_BASE + pathOrUrl;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && retries > 0) {
    cached = null;
    return userFetch(pathOrUrl, { method, body, retries: retries - 1 });
  }
  if (response.status === 204) return null;
  if (response.status === 403) {
    throw new SpotifyError(
      'Al token de Spotify le falta un permiso. Volvé a correr `npm run spotify-token`.',
      403,
    );
  }
  if (!response.ok) throw new SpotifyError(`Spotify respondió ${response.status}.`, 502);

  return response.json();
}
