/**
 * Búsqueda por ánimo: «algo para manejar de noche» -> canciones de mis
 * playlists elegidas por una IA.
 *
 *   GET  /api/mood          -> 200 { enabled: true } | 204 si está apagada
 *   POST /api/mood { q }    -> 200 { id }: arma una selección
 *   GET  /api/mood?ref=<id> -> esa selección, con la MISMA forma que
 *                              /api/playlist (kind 'mood') y un `why` por pista
 *
 * La IA (_ai.js) elige de un catálogo cerrado (_catalog.js: las playlists del
 * repo, menos la de recomendaciones). No puede inventar canciones: un id que no
 * está en el catálogo se descarta (_mood.js), y todo lo que devuelve se
 * reproduce con el motor de siempre.
 *
 * Cada POST es una selección nueva, aunque la frase se repita: la IA recibe los
 * ids que ya eligió para esa frase (`mood:seen:`) y, si hay otras que encajen,
 * prefiere esas. Así funciona «Otra tanda». Lo que se guarda es cada selección
 * con su id, que es lo que va en `?mood=`: un link compartido abre exactamente
 * lo que vio quien lo compartió.
 *
 * Cada POST gasta cupo del plan gratuito de la IA: 10 por hora por IP (solo en
 * Vercel) y GLOBAL_DAY al día entre todos.
 *
 * NO resuelve previews; de eso se encarga /api/previews con `kind=mood`, que
 * lee la selección guardada (`moodTracks`) sin volver a llamar a la IA.
 */
import { SpotifyError } from './_spotify.js';
import { fetchArtistDetails, fetchFullTracks, normalizeTrack } from './_normalize.js';
import {
  kv,
  kvConfigured,
  kvPipeline,
  overLimit,
  readJson,
  sameOrigin,
} from './_kv.js';
import { rateLimited } from './_ratelimit.js';
import { logError } from './_log.js';
import { aiConfigured, AiError, askMood } from './_ai.js';
import { loadCatalog } from './_catalog.js';
import { checkPicks, cleanQuery, LIMITS, newMoodId, parseMoodId, queryKey } from './_mood.js';

const DAY = 86_400;
// Lo que dura un link compartido de una selección.
const SELECTION_TTL = 60 * DAY;
const SEEN_TTL = 30 * DAY;
const PER_IP_HOUR = 10;
const GLOBAL_DAY = 200;

const selectionKey = (id) => `mood:s:${id}`;
/* v2: guarda ids de mis canciones. En v1 eran «canción — artista» de las
   nuevas, de cuando la búsqueda recomendaba fuera del catálogo. */
const seenKey = (q) => `mood:seen:v2:${queryKey(q)}`;

export function moodConfigured() {
  return aiConfigured() && kvConfigured();
}

async function loadSelection(id) {
  const raw = await kv('GET', selectionKey(id));
  return raw ? JSON.parse(raw) : null;
}

/**
 * Las pistas COMPLETAS de Spotify de una selección ya hecha, en su orden. La
 * usa /api/previews, que necesita el ISRC. Desde acá nunca se llama a la IA.
 */
export async function moodTracks(id) {
  const selection = moodConfigured() ? await loadSelection(id) : null;
  if (!selection?.picks?.length) return [];
  const full = await fetchFullTracks(selection.picks.map((pick) => pick.id));
  return selection.picks.map((pick) => full.get(pick.id)).filter(Boolean);
}

/** Cuenta una búsqueda. Devuelve el mensaje del 429, o null si puede pasar. */
async function spend(req) {
  /* En `npm run dev` todo sale de la misma IP (::1) y probar un rato alcanza
     el límite. Vercel define VERCEL=1 en sus funciones: fuera de ahí no se
     cuenta por IP, pero el techo diario sigue. */
  if (process.env.VERCEL && (await overLimit(req, 'mood', PER_IP_HOUR, 3600))) {
    return 'Ya buscaste un montón. Probá de nuevo en un rato.';
  }
  const globalKey = `rl:mood:all:${new Date().toISOString().slice(0, 10)}`;
  const [count] = await kvPipeline([
    ['INCR', globalKey],
    ['EXPIRE', globalKey, String(DAY), 'NX'],
  ]);
  if (Number(count) > GLOBAL_DAY) {
    logError('mood', { status: 429, message: 'techo diario global alcanzado' });
    return 'Hoy la IA ya eligió demasiado. Probá mañana.';
  }
  return null;
}

/** POST: arma una selección para la frase y devuelve su id. */
async function create(req, res) {
  if (
    !sameOrigin(req) ||
    !String(req.headers?.['content-type'] || '').includes('application/json')
  ) {
    return res.status(403).json({ error: 'No permitido.' });
  }

  const body = await readJson(req).catch(() => ({}));
  const q = cleanQuery(body?.q);
  if (!q) {
    return res.status(400).json({ error: 'Contame con unas palabras qué querés escuchar.' });
  }

  const refused = await spend(req);
  if (refused) return res.status(429).json({ error: refused });

  const [catalog, seen] = await Promise.all([
    loadCatalog(),
    kv('LRANGE', seenKey(q), '0', String(LIMITS.avoid - 1)).then((list) => list || []),
  ]);

  const raw = await askMood(catalog, q, seen);
  const checked = checkPicks(raw, catalog);

  const id = newMoodId();
  const selection = {
    q,
    intro: checked?.intro || String(raw?.intro || '').slice(0, LIMITS.intro) || null,
    picks: checked?.picks || [],
    at: new Date().toISOString(),
  };

  const commands = [['SET', selectionKey(id), JSON.stringify(selection), 'EX', String(SELECTION_TTL)]];
  if (selection.picks.length) {
    commands.push(
      ['LPUSH', seenKey(q), ...selection.picks.map((pick) => pick.id)],
      ['LTRIM', seenKey(q), '0', String(LIMITS.avoid - 1)],
      ['EXPIRE', seenKey(q), String(SEEN_TTL)],
    );
  }
  await kvPipeline(commands);

  return res.status(200).json({ id });
}

/** GET ?ref=<id>: una selección ya hecha, con la forma de una playlist. */
async function read(req, res) {
  const id = parseMoodId(req.query.ref);
  if (!id) return res.status(400).json({ error: 'Selección no válida.' });

  const selection = await loadSelection(id);
  if (!selection) {
    return res
      .status(404)
      .json({ error: 'Esa selección ya no existe. Buscá de nuevo y la IA arma otra.' });
  }

  const ids = selection.picks.map((pick) => pick.id);
  const full = ids.length ? await fetchFullTracks(ids) : new Map();
  const raw = ids.map((trackId) => full.get(trackId)).filter(Boolean);
  const artists = await fetchArtistDetails(raw.map((track) => track.artists?.[0]?.id));
  const why = new Map(selection.picks.map((pick) => [pick.id, pick.why]));

  const tracks = raw.map((track) => ({
    ...normalizeTrack(track, artists.get(track.artists?.[0]?.id)),
    why: why.get(track.id) || null,
  }));

  // Una selección no cambia nunca: se puede cachear todo lo que dure.
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json({
    kind: 'mood',
    id,
    name: selection.q,
    description:
      selection.intro ||
      (tracks.length ? null : 'No encontré nada para eso. Probá con otras palabras.'),
    owner: null,
    image: tracks[0]?.art?.lg || null,
    externalUrl: null,
    trackCount: tracks.length,
    totalCount: tracks.length,
    tracks,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  if (!moodConfigured()) {
    if (req.method === 'GET' && !req.query?.ref) {
      res.statusCode = 204;
      return res.end();
    }
    return res.status(404).json({ error: 'La búsqueda por ánimo no está disponible.' });
  }

  if (req.method === 'GET' && !req.query?.ref) return res.status(200).json({ enabled: true });

  if (rateLimited(req, res)) return;

  try {
    return req.method === 'POST' ? await create(req, res) : await read(req, res);
  } catch (error) {
    // Saturada o sin cupo: pasa en el plan gratis y se arregla solo en un rato.
    if (error instanceof AiError && (error.status === 429 || error.status === 503)) {
      logError('mood', error);
      return res
        .status(error.status)
        .json({ error: 'La IA está saturada. Probá de nuevo en un minuto.' });
    }
    const status = error instanceof SpotifyError ? error.status : 500;
    logError('mood', { status, message: error.message }, { method: req.method });
    return res
      .status(status === 404 ? 500 : status)
      .json({ error: 'No pude armar la selección. Probá de nuevo en un rato.' });
  }
}
