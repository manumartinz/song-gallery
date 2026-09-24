/**
 * GET /api/previews?ref=<playlist | album>&kind=<playlist|album>&offset=<n>&limit=<n>
 *
 * Resuelve las URLs de preview de un tramo de la fuente. Existe para que
 * /api/playlist pueda responder al instante: antes el primer visitante esperaba
 * a que se resolviesen hasta 200 previews antes de ver una sola fila.
 *
 * Devuelve los resultados indexados por ID DE PISTA, no por posicion. El
 * endpoint de metadata descarta episodios y pistas locales, asi que las
 * posiciones que ve el cliente no coinciden con los offsets de Spotify; cruzar
 * por id evita ese desajuste por completo.
 */
import { parsePlaylistId, parseAlbumId, spotifyGet, SpotifyError, NOT_FOUND } from './_spotify.js';
import { fetchFullTracks } from './_normalize.js';
import { rateLimited } from './_ratelimit.js';
import { resolvePreview, mapWithConcurrency } from './_preview.js';

const CONCURRENCY = 8;
const MAX_LIMIT = 50;

const FIELDS =
  'items(track(id,name,duration_ms,type,is_local,external_ids(isrc),artists(name)))';

/** Un tramo de playlist: ya viene con el ISRC en la misma respuesta. */
async function playlistChunk(id, offset, limit) {
  const page = await spotifyGet(
    `/playlists/${id}/tracks?offset=${offset}&limit=${limit}&fields=${encodeURIComponent(FIELDS)}`,
  );

  return (page.items || [])
    .map((item) => item?.track)
    .filter((track) => track?.id && track.type === 'track' && !track.is_local);
}

/**
 * Un tramo de album: hacen falta DOS llamadas.
 *
 * /albums/{id}/tracks devuelve pistas simplificadas, sin `external_ids`, y sin
 * ISRC la resolucion se queda solo con la busqueda por texto, que se equivoca
 * con remasterizaciones y directos. La segunda llamada las recupera enteras.
 */
async function albumChunk(id, offset, limit) {
  const opts = { notFound: NOT_FOUND.album };
  const page = await spotifyGet(`/albums/${id}/tracks?offset=${offset}&limit=${limit}`, opts);

  const simple = (page.items || []).filter(
    (track) => track?.id && track.type === 'track' && !track.is_local,
  );

  const full = await fetchFullTracks(
    simple.map((track) => track.id),
    opts,
  );

  return simple.map((track) => ({ ...track, external_ids: full.get(track.id)?.external_ids }));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  // La web es publica: sin esto cualquiera puede vaciar la cuota de Spotify.
  if (rateLimited(req, res)) return;

  const isAlbum = req.query?.kind === 'album';
  const id = isAlbum ? parseAlbumId(req.query?.ref) : parsePlaylistId(req.query?.ref);
  if (!id) {
    return res
      .status(400)
      .json({ error: isAlbum ? 'Link de álbum no válido.' : 'Link de playlist no válido.' });
  }

  const offset = Math.max(0, Number(req.query?.offset) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query?.limit) || 40));

  try {
    const tracks = isAlbum
      ? await albumChunk(id, offset, limit)
      : await playlistChunk(id, offset, limit);

    const previews = await mapWithConcurrency(tracks, CONCURRENCY, async (track) => {
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
