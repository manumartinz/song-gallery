/**
 * Las recomendaciones que llegan y la playlist a la que mando las que me
 * gustan. Lo usan el panel (/api/admin) y `npm run recs`, así que lo que se
 * haga en uno aparece en el otro.
 *
 * En Redis:
 *   recs            lista de recomendaciones (JSON), la más nueva primero
 *   recs:added      hash clave -> id de canción: las que entraron a la playlist
 *   recs:discarded  hash clave -> fecha: las que descarté (no se borran)
 *
 * La clave de cada una es `recKey` (su id, o su fecha si es de antes del id).
 */
import { kv, kvPipeline } from './_kv.js';
import { parsePlaylistId, spotifyGet } from './_spotify.js';
import { userFetch } from './_user.js';
import { pickArt } from './_normalize.js';
import { mapWithConcurrency, resolvePreview } from './_preview.js';
import { recKey, searchQueryFor, trackIdFrom, youtubeUrlFrom } from './_recommendation.js';

export const ADDED = 'recs:added';
export const DISCARDED = 'recs:discarded';

/** El id de la playlist de recomendaciones, o null si no está configurada. */
export function recsPlaylistId() {
  return parsePlaylistId(process.env.SPOTIFY_RECS_PLAYLIST);
}

/** HGETALL por REST llega como lista plana: campo, valor, campo, valor... */
function toMap(flat) {
  const map = new Map();
  for (let i = 0; i + 1 < (flat || []).length; i += 2) map.set(flat[i], flat[i + 1]);
  return map;
}

/** Todas las recomendaciones (son 2000 como mucho), con su estado. */
export async function listRecs() {
  const [raw, added, discarded] = await kvPipeline([
    ['LRANGE', 'recs', '0', '-1'],
    ['HGETALL', ADDED],
    ['HGETALL', DISCARDED],
  ]);
  const addedMap = toMap(added);
  const discardedMap = toMap(discarded);

  return (raw || []).flatMap((entry, index) => {
    let rec;
    try {
      rec = JSON.parse(entry);
    } catch {
      return [];
    }
    const key = recKey(rec);
    const trackId = addedMap.get(key) || null;
    const state = trackId ? 'added' : discardedMap.has(key) ? 'discarded' : 'new';
    return [{ ...rec, key, index, state, trackId }];
  });
}

export async function findRec(key) {
  return (await listRecs()).find((rec) => rec.key === key) || null;
}

/* ---------- Resolver la canción ---------- */

/** Lo que interesa de una pista para decidir: portada, nombres y preview. */
async function toCandidates(tracks) {
  return mapWithConcurrency(tracks.filter(Boolean), 5, async (track) => {
    const artist = (track.artists || []).map((a) => a.name).join(', ');
    const preview = await resolvePreview({
      isrc: track.external_ids?.isrc,
      title: track.name,
      artist: track.artists?.[0]?.name || '',
      durationMs: track.duration_ms,
    }).catch(() => null);
    return {
      id: track.id,
      title: track.name,
      artist,
      album: track.album?.name || null,
      art: pickArt(track.album?.images).md,
      url: track.external_urls?.spotify || null,
      previewUrl: preview?.previewUrl ?? null,
    };
  });
}

/**
 * El título de un video de YouTube, sin lo que no es la canción: "(Official
 * Video)", "[Lyrics]", "HD"... Sin clave: el oEmbed de YouTube es público.
 */
export function cleanVideoTitle(title) {
  return String(title ?? '')
    .replace(/[([][^)\]]*(official|video|audio|lyric|letra|visualizer|hd|4k|remaster)[^)\]]*[)\]]/gi, ' ')
    .replace(/\b(official (music )?video|lyrics?|video oficial)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function youtubeTitle(url) {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!response.ok) return null;
    const { title } = await response.json();
    return cleanVideoTitle(title) || null;
  } catch {
    return null;
  }
}

/**
 * Candidatos para una recomendación. `override` es lo que se escribe a mano en
 * el panel: un link de Spotify (manda sobre todo) o un texto para buscar.
 * Devuelve `{ query, exact, candidates }`: `exact` si vino de un link, y en ese
 * caso hay uno solo.
 */
export async function resolveRec(text, override = '') {
  const linked = trackIdFrom(override) || (override ? null : trackIdFrom(text));
  if (linked) {
    const track = await spotifyGet(`/tracks/${linked}`, {
      notFound: 'Esa canción no existe en Spotify.',
    });
    return { query: null, exact: true, candidates: await toCandidates([track]) };
  }

  let query = searchQueryFor(override);
  if (!query) {
    const video = youtubeUrlFrom(text);
    query = (video && (await youtubeTitle(video))) || searchQueryFor(text);
  }
  if (!query) return { query: '', exact: false, candidates: [] };

  const found = await spotifyGet(`/search?type=track&limit=5&q=${encodeURIComponent(query)}`);
  return { query, exact: false, candidates: await toCandidates(found.tracks?.items || []) };
}

/* ---------- La playlist ---------- */

/**
 * Llamada a los ítems de la playlist. Spotify anunció que `/tracks` pasa a
 * `/items`: si la primera contesta 404 o 410 se prueba la segunda, que además
 * llama `items` a lo que antes era `tracks` en el cuerpo del DELETE.
 */
async function itemsCall(method, query = '', body) {
  const id = recsPlaylistId();
  if (!id) throw new Error('Falta SPOTIFY_RECS_PLAYLIST.');
  try {
    return await userFetch(`/playlists/${id}/tracks${query}`, { method, body });
  } catch (error) {
    if (![404, 410].includes(error.spotifyStatus)) throw error;
    const renamed = body?.tracks ? { ...body, items: body.tracks, tracks: undefined } : body;
    return userFetch(`/playlists/${id}/items${query}`, { method, body: renamed });
  }
}

/** Lo que hay en la playlist, en orden, con quién recomendó cada canción. */
export async function playlistItems() {
  const items = [];
  let query = '?limit=100';
  for (let page = 0; page < 10; page++) {
    const data = await itemsCall('GET', query);
    items.push(...(data?.items || []));
    if (!data?.next) break;
    query = `?limit=100&offset=${items.length}`;
  }

  const recs = await listRecs();
  const byTrack = new Map(recs.filter((rec) => rec.trackId).map((rec) => [rec.trackId, rec]));

  return items
    .map((item) => item?.track || item?.item)
    .filter((track) => track?.id)
    .map((track, position) => {
      const rec = byTrack.get(track.id);
      return {
        position,
        id: track.id,
        uri: track.uri || `spotify:track:${track.id}`,
        title: track.name,
        artist: (track.artists || []).map((a) => a.name).join(', '),
        art: pickArt(track.album?.images).sm,
        url: track.external_urls?.spotify || null,
        by: rec?.name || null,
        recKey: rec?.key || null,
      };
    });
}

/** Manda una recomendación a la playlist. Si la canción ya estaba, no la duplica. */
export async function addRec(key, trackId) {
  if (!/^[A-Za-z0-9]{22}$/.test(String(trackId))) throw new Error('Canción no válida.');
  const current = await playlistItems();
  if (!current.some((item) => item.id === trackId)) {
    await itemsCall('POST', '', { uris: [`spotify:track:${trackId}`] });
  }
  await kvPipeline([
    ['HSET', ADDED, key, trackId],
    ['HDEL', DISCARDED, key],
  ]);
}

export async function discardRec(key) {
  await kv('HSET', DISCARDED, key, new Date().toISOString());
}

export async function restoreRec(key) {
  await kv('HDEL', DISCARDED, key);
}

/**
 * Saca una canción de la playlist. La recomendación que la trajo vuelve a
 * "nuevas": sacarla no es lo mismo que descartarla.
 */
export async function removeItem(trackId) {
  await itemsCall('DELETE', '', { tracks: [{ uri: `spotify:track:${trackId}` }] });
  const rec = (await listRecs()).find((item) => item.trackId === trackId);
  if (rec) await kv('HDEL', ADDED, rec.key);
}

/** Mueve la canción de la posición `from` a `to` (índices desde 0). */
export async function moveItem(from, to) {
  const total = (await playlistItems()).length;
  if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error('Posición no válida.');
  if (from < 0 || to < 0 || from >= total || to >= total || from === to) return;
  /* Spotify inserta "antes de": para bajar una hay que apuntar a la de
     después de su destino. */
  await itemsCall('PUT', '', { range_start: from, insert_before: to > from ? to + 1 : to });
}
