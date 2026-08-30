/**
 * Cliente minimo de la Spotify Web API con el flujo Client Credentials.
 *
 * Solo se ejecuta en el servidor: el client_secret nunca llega al navegador.
 * El token se cachea en el scope del modulo, asi que las invocaciones
 * "calientes" de la lambda lo reutilizan en vez de pedir uno nuevo.
 */

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

let cachedToken = null; // { value, expiresAt }

export class SpotifyError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'SpotifyError';
    this.status = status;
  }
}

/** Extrae el id de una URL, un URI `spotify:playlist:ID` o un id pelado. */
export function parsePlaylistId(ref) {
  if (!ref) return null;
  const value = String(ref).trim();
  const match =
    value.match(/playlist[/:]([A-Za-z0-9]{22})/) || value.match(/^([A-Za-z0-9]{22})$/);
  return match ? match[1] : null;
}

async function requestToken() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!id || !secret) {
    throw new SpotifyError(
      'Faltan SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET. Copia .env.example a .env.local y rellénalos.',
      500,
    );
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new SpotifyError('Spotify rechazó las credenciales. Revisa el client id y el secret.', 502);
  }

  const json = await response.json();
  cachedToken = {
    value: json.access_token,
    // 30 s de margen para no usar un token que caduque a mitad de peticion.
    expiresAt: Date.now() + json.expires_in * 1000 - 30_000,
  };
  return cachedToken.value;
}

async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  return requestToken();
}

/** GET autenticado. Acepta una ruta (`/playlists/x`) o una URL absoluta de paginacion. */
export async function spotifyGet(pathOrUrl, retries = 2) {
  const token = await getToken();
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : API_BASE + pathOrUrl;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (response.status === 401 && retries > 0) {
    cachedToken = null; // token caducado antes de tiempo: renovar y reintentar
    return spotifyGet(pathOrUrl, retries - 1);
  }

  if (response.status === 429 && retries > 0) {
    const waitSeconds = Math.min(Number(response.headers.get('retry-after')) || 1, 5);
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    return spotifyGet(pathOrUrl, retries - 1);
  }

  if (response.status === 404) {
    throw new SpotifyError(
      'Esa playlist no existe, es privada, o pertenece a Spotify. Las playlists editoriales y algorítmicas (Discover Weekly, Top 50, Radar...) están bloqueadas en la API publica: usa una creada por un usuario.',
      404,
    );
  }

  if (!response.ok) {
    throw new SpotifyError(`Spotify respondió ${response.status}.`, 502);
  }

  return response.json();
}
