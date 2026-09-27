/**
 * GET /api/now
 *
 * Lo que estoy escuchando en Spotify ahora mismo, o lo último que escuché.
 *
 * Es el único endpoint que habla con MI cuenta y no con el catálogo: usa un
 * refresh token mío (SPOTIFY_REFRESH_TOKEN) con los permisos
 * user-read-currently-playing y user-read-recently-played. Se saca una vez con
 * `npm run spotify-token`. Sin él, responde 204 y la web no enseña nada.
 *
 * Nunca devuelve más que título, artista, portada, enlace y si suena: ni el
 * dispositivo, ni el contexto, ni nada que diga dónde estoy.
 */
import { pickArt } from './_normalize.js';
import { logError } from './_log.js';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1/me/player';

let cached = null; // { value, expiresAt }

async function userToken() {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

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
  if (!response.ok) throw new Error(`token ${response.status}`);

  const json = await response.json();
  cached = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 - 30_000 };
  return cached.value;
}

/** Lo único que sale de aquí. Los episodios de podcast no cuentan. */
export function toNow(track, playing) {
  if (!track?.id || track.type !== 'track') return null;
  return {
    playing,
    id: track.id,
    title: track.name,
    artist: (track.artists || []).map((a) => a.name).join(', '),
    art: pickArt(track.album?.images).sm,
    url: track.external_urls?.spotify || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });

  if (!process.env.SPOTIFY_REFRESH_TOKEN) {
    res.statusCode = 204;
    return res.end();
  }

  try {
    const token = await userToken();
    const headers = { Authorization: `Bearer ${token}` };

    const current = await fetch(`${API}/currently-playing`, { headers });
    let now = null;
    if (current.status === 200) {
      const json = await current.json();
      now = toNow(json.item, Boolean(json.is_playing));
    }

    // En pausa o sin nada: lo último que sonó.
    if (!now || !now.playing) {
      const recent = await fetch(`${API}/recently-played?limit=1`, { headers });
      if (recent.ok) {
        const json = await recent.json();
        now = now || toNow(json.items?.[0]?.track, false);
      }
    }

    /* Treinta segundos en el edge: suficiente para que una visita con mucho
       tráfico no me gaste la cuota, y lo bastante fresco para "ahora". */
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    if (!now) {
      res.statusCode = 204;
      return res.end();
    }
    return res.status(200).json(now);
  } catch (error) {
    logError('now', error);
    res.statusCode = 204; // que no se vea: es un adorno, no algo que pueda fallar
    return res.end();
  }
}
