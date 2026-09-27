/**
 *   GET /api/mine         -> 200 { sources: ['top'] } | 204 si no hay token
 *   GET /api/mine?ref=top -> lo que más escuché en ~4 semanas
 *
 * Fuentes armadas desde MI cuenta y no desde una playlist. Devuelven la MISMA
 * forma que /api/playlist, igual que los álbumes: el cliente las carga, las
 * ordena y las reproduce con el motor de siempre.
 *
 * Sin ref dice cuáles puede ofrecer, según los permisos del token: con uno
 * sacado antes de `user-top-read`, "mi mes" no sale, en vez de enseñar un
 * rótulo que al abrirlo falla.
 *
 * NO resuelve previews; de eso se encarga /api/previews con `kind=me`.
 */
import { SpotifyError } from './_spotify.js';
import { userConfigured, userFetch, userScopes } from './_user.js';
import { fetchArtistDetails, normalizeTrack } from './_normalize.js';
import { rateLimited } from './_ratelimit.js';
import { logError } from './_log.js';
import { MINE, mineById, parseMineRef } from '../src/config/mine.js';

/* Lo del mes casi no se mueve en una hora. */
const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

const isTrack = (track) => track?.id && track.type === 'track' && !track.is_local;

/**
 * Las pistas completas de una fuente, en su orden. La usa también
 * /api/previews, que necesita el ISRC de las mismas pistas.
 */
export async function mineTracks() {
  const page = await userFetch('/me/top/tracks?time_range=short_term&limit=50');
  return (page?.items || []).filter(isTrack);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });

  if (!userConfigured()) {
    if (!req.query?.ref) {
      res.statusCode = 204;
      return res.end();
    }
    return res.status(404).json({ error: 'Esta fuente no está disponible.' });
  }

  if (!req.query?.ref) {
    try {
      const scopes = await userScopes();
      const sources = MINE.filter((item) => scopes.has(item.scope)).map((item) => item.id);
      // Los permisos solo cambian al sacar otro token: cinco minutos sobran.
      res.setHeader('Cache-Control', 'public, s-maxage=300');
      return res.status(200).json({ sources });
    } catch (error) {
      logError('mine', error);
      res.statusCode = 204; // como /api/now: si falla, no se enseña y ya
      return res.end();
    }
  }

  if (rateLimited(req, res)) return;

  const id = parseMineRef(req.query.ref);
  if (!id) return res.status(400).json({ error: 'Fuente no válida.' });

  try {
    const raw = await mineTracks();
    const artistDetails = await fetchArtistDetails(raw.map((track) => track.artists?.[0]?.id));
    // Sin fecha de añadido: el top no la tiene (el cliente oculta ese orden).
    const tracks = raw.map((track) =>
      normalizeTrack(track, artistDetails.get(track.artists?.[0]?.id)),
    );
    const meta = mineById(id);

    res.setHeader('Cache-Control', CACHE);
    return res.status(200).json({
      kind: 'me',
      id,
      name: meta.name,
      description: meta.description,
      owner: null,
      image: tracks[0]?.art?.lg || null,
      externalUrl: null,
      trackCount: tracks.length,
      totalCount: tracks.length,
      tracks,
    });
  } catch (error) {
    const status = error instanceof SpotifyError ? error.status : 500;
    logError('mine', { status, message: error.message }, { ref: req.query?.ref });
    return res.status(status).json({ error: error.message || 'Error inesperado.' });
  }
}
