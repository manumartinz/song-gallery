/**
 * GET /api/previews?ref=<playlist>&offset=<n>&limit=<n>
 *
 * Resuelve las URLs de preview de un tramo de la playlist. Existe para que
 * /api/playlist pueda responder al instante: antes el primer visitante esperaba
 * a que se resolviesen hasta 200 previews antes de ver una sola fila.
 *
 * Devuelve los resultados indexados por ID DE PISTA, no por posicion. El
 * endpoint de metadata descarta episodios y pistas locales, asi que las
 * posiciones que ve el cliente no coinciden con los offsets de Spotify; cruzar
 * por id evita ese desajuste por completo.
 */
import { parsePlaylistId, spotifyGet, SpotifyError } from './_spotify.js';
import { rateLimited } from './_ratelimit.js';
import { resolvePreview, mapWithConcurrency } from './_preview.js';

const CONCURRENCY = 8;
const MAX_LIMIT = 50;

const FIELDS =
  'items(track(id,name,duration_ms,type,is_local,external_ids(isrc),artists(name)))';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  // La web es publica: sin esto cualquiera puede vaciar la cuota de Spotify.
  if (rateLimited(req, res)) return;

  const playlistId = parsePlaylistId(req.query?.ref);
  if (!playlistId) {
    return res.status(400).json({ error: 'Link de playlist no válido.' });
  }

  const offset = Math.max(0, Number(req.query?.offset) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query?.limit) || 40));

  try {
    const page = await spotifyGet(
      `/playlists/${playlistId}/tracks?offset=${offset}&limit=${limit}&fields=${encodeURIComponent(FIELDS)}`,
    );

    const entries = (page.items || []).filter(
      (item) => item?.track?.id && item.track.type === 'track' && !item.track.is_local,
    );

    const previews = await mapWithConcurrency(entries, CONCURRENCY, async (entry) => {
      const track = entry.track;
      const found = await resolvePreview({
        isrc: track.external_ids?.isrc,
        title: track.name,
        artist: track.artists?.[0]?.name || '',
        durationMs: track.duration_ms,
      });

      return {
        id: track.id,
        previewUrl: found?.previewUrl ?? null,
        previewSource: found?.previewSource ?? null,
      };
    });

    /* Las URLs de Deezer van firmadas y caducan a los ~15 minutos, asi que
       cachearlas una hora (y servirlas hasta 24 h en stale) era entregar
       enlaces muertos y que no sonase nada.

       Se separan los dos niveles a proposito:
        - El navegador NO las guarda: cuando vuelva, que pida frescas.
        - El edge las guarda 5 minutos, margen de sobra sobre los 15 de vida.
       Se usa CDN-Cache-Control porque `s-maxage` en Cache-Control lo consume
       Vercel sin dejar rastro en la respuesta, y esto si se puede comprobar. */
    res.setHeader('CDN-Cache-Control', 'public, s-maxage=300');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ previews });
  } catch (error) {
    const status = error instanceof SpotifyError ? error.status : 500;
    return res.status(status).json({ error: error.message || 'Error inesperado.' });
  }
}
