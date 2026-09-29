/**
 * «Parecidas a esta»: tres canciones NUEVAS, que no están en mis playlists,
 * del mismo estilo que una mía.
 *
 *   GET /api/similar                -> 200 { enabled: true } | 204 si está apagado
 *   GET /api/similar?id=<id>        -> 200 { tracks } con las parecidas
 *   GET /api/similar?id=<id>&more=1 -> otras tres, distintas de las ya sugeridas
 *
 * La IA (_ai.js, `askSimilar`) las propone por título y artista, con mis
 * playlists como gusto de fondo. Cada propuesta se busca en Spotify y solo
 * entra si aparece con ese título y ese artista (_similar.js, `bestMatch`):
 * nada inventado llega a la web. Las pistas salen con la forma de siempre
 * (`normalizeTrack`) y con su preview ya resuelto, para sonar ahí mismo.
 *
 * Lo que eligió la IA se guarda por canción en Redis 30 días: la primera vez
 * cuesta una llamada y después sale de acá. `more=1` pide otra tanda y suma lo
 * sugerido a `similar:seen:`, para que no se repita. Los previews NO se
 * guardan: son enlaces firmados que caducan a los ~15 minutos.
 *
 * Solo las llamadas a la IA gastan cupo: 20 por hora por IP (en Vercel) y
 * GLOBAL_DAY al día entre todos.
 */
import { spotifyGet, SpotifyError } from './_spotify.js';
import { fetchArtistDetails, fetchFullTracks, normalizeTrack } from './_normalize.js';
import { kv, kvConfigured, kvPipeline, overLimit } from './_kv.js';
import { rateLimited } from './_ratelimit.js';
import { logError } from './_log.js';
import { mapWithConcurrency, resolvePreview } from './_preview.js';
import { aiConfigured, AiError, askSimilar } from './_ai.js';
import { loadCatalog } from './_catalog.js';
import { bestMatch, checkCandidates, SIMILAR, songKey } from './_similar.js';

const DAY = 86_400;
const PICKS_TTL = 30 * DAY;
const PER_IP_HOUR = 20;
const GLOBAL_DAY = 300;

const TRACK_ID = /^[A-Za-z0-9]{22}$/;
const picksKey = (id) => `similar:v1:${id}`;
const seenKey = (id) => `similar:seen:v1:${id}`;

/** Cuenta una llamada a la IA. Devuelve el mensaje del 429, o null si puede pasar. */
async function spend(req) {
  if (process.env.VERCEL && (await overLimit(req, 'similar', PER_IP_HOUR, 3600))) {
    return 'Pediste un montón seguidas. Probá de nuevo en un rato.';
  }
  const globalKey = `rl:similar:all:${new Date().toISOString().slice(0, 10)}`;
  const [count] = await kvPipeline([
    ['INCR', globalKey],
    ['EXPIRE', globalKey, String(DAY), 'NX'],
  ]);
  if (Number(count) > GLOBAL_DAY) {
    logError('similar', { status: 429, message: 'techo diario global alcanzado' });
    return 'Hoy la IA ya recomendó demasiado. Probá mañana.';
  }
  return null;
}

/**
 * Las propuestas de la IA, ya como pistas de Spotify. Primero la búsqueda por
 * campos, que es la precisa; si no aparece, la de texto libre. Se queda con
 * las primeras SIMILAR.show que encajan con su título y su artista.
 */
async function resolveCandidates(candidates, exclude) {
  const tracks = await Promise.all(
    candidates.map(async (item) => {
      for (const query of [`track:${item.title} artist:${item.artist}`, `${item.title} ${item.artist}`]) {
        const page = await spotifyGet(`/search?type=track&limit=10&q=${encodeURIComponent(query)}`);
        const track = bestMatch(page.tracks?.items, item, exclude);
        if (track) return track;
      }
      return null;
    }),
  );

  const found = [];
  tracks.forEach((track, i) => {
    // Dos propuestas pueden caer en la misma pista: se queda la primera.
    if (!track || exclude.has(track.id) || found.length === SIMILAR.show) return;
    exclude.add(track.id);
    found.push({
      id: track.id,
      why: candidates[i].why,
      title: track.name,
      artist: track.artists?.[0]?.name || candidates[i].artist,
    });
  });
  return found;
}

/** Pide a la IA una tanda nueva para `id`, la guarda y la devuelve. */
async function freshPicks(id) {
  const [seed, catalog, seen] = await Promise.all([
    spotifyGet(`/tracks/${id}`, { notFound: 'Esa canción no existe.' }),
    loadCatalog(),
    kv('LRANGE', seenKey(id), '0', String(SIMILAR.avoid - 1)).then((list) => list || []),
  ]);
  const artists = await fetchArtistDetails([seed.artists?.[0]?.id]);
  const track = normalizeTrack(seed, artists.get(seed.artists?.[0]?.id));

  const raw = await askSimilar(
    {
      title: track.title,
      artists: track.artistLine,
      album: track.album,
      year: track.year,
      genre: track.genre,
    },
    catalog,
    seen,
  );

  const avoidKeys = seen.map((line) => {
    const [title, artist] = line.split(' — ');
    return songKey(title, artist);
  });
  // Ni la canción de partida ni otra del mismo artista cuentan como parecida.
  const seedKey = songKey(track.title, track.artists[0]?.name);
  const candidates = checkCandidates(raw, catalog, [...avoidKeys, seedKey]).filter(
    (item) => songKey('', item.artist) !== songKey('', track.artists[0]?.name),
  );
  const exclude = new Set([id, ...catalog.map((entry) => entry.id)]);
  const picks = await resolveCandidates(candidates, exclude);

  const commands = [['SET', picksKey(id), JSON.stringify({ picks }), 'EX', String(PICKS_TTL)]];
  if (picks.length) {
    commands.push(
      ['LPUSH', seenKey(id), ...picks.map((pick) => `${pick.title} — ${pick.artist}`)],
      ['LTRIM', seenKey(id), '0', String(SIMILAR.avoid - 1)],
      ['EXPIRE', seenKey(id), String(PICKS_TTL)],
    );
  }
  await kvPipeline(commands);
  return picks;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });

  if (!aiConfigured() || !kvConfigured()) {
    res.statusCode = 204;
    return res.end();
  }

  if (!req.query?.id) return res.status(200).json({ enabled: true });

  const id = String(req.query.id).trim();
  if (!TRACK_ID.test(id)) return res.status(400).json({ error: 'Canción no válida.' });

  // Solo desde la propia web: otra página no puede gastar el cupo con esto.
  if (req.headers?.['sec-fetch-site'] === 'cross-site') {
    return res.status(403).json({ error: 'No permitido.' });
  }

  if (rateLimited(req, res)) return;

  const more = req.query.more === '1';

  try {
    const cached = more ? null : await kv('GET', picksKey(id));
    let picks = cached ? JSON.parse(cached).picks : null;

    if (!picks) {
      const refused = await spend(req);
      if (refused) return res.status(429).json({ error: refused });
      picks = await freshPicks(id);
    }

    const ids = picks.map((pick) => pick.id);
    const full = ids.length ? await fetchFullTracks(ids) : new Map();
    const raw = ids.map((trackId) => full.get(trackId)).filter(Boolean);
    const artists = await fetchArtistDetails(raw.map((track) => track.artists?.[0]?.id));
    const why = new Map(picks.map((pick) => [pick.id, pick.why]));

    const tracks = await mapWithConcurrency(raw, SIMILAR.show, async (track) => {
      const preview = await resolvePreview({
        isrc: track.external_ids?.isrc,
        title: track.name,
        artist: track.artists?.[0]?.name || '',
        durationMs: track.duration_ms,
      });
      return {
        ...normalizeTrack(track, artists.get(track.artists?.[0]?.id)),
        why: why.get(track.id) || null,
        previewUrl: preview?.previewUrl ?? null,
        previewSource: preview?.previewSource ?? null,
      };
    });

    /* Como /api/previews: los enlaces de audio caducan, así que el navegador no
       guarda nada y el edge solo cinco minutos. Una tanda nueva no se guarda. */
    if (!more) res.setHeader('CDN-Cache-Control', 'public, s-maxage=300');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ tracks });
  } catch (error) {
    if (error instanceof AiError && (error.status === 429 || error.status === 503)) {
      logError('similar', error, { id });
      return res
        .status(error.status)
        .json({ error: 'La IA está saturada. Probá de nuevo en un minuto.' });
    }
    const status = error instanceof SpotifyError ? error.status : 500;
    logError('similar', { status, message: error.message }, { id });
    return res
      .status(status === 404 ? 404 : 500)
      .json({ error: 'No pude encontrar parecidas. Probá de nuevo en un rato.' });
  }
}
