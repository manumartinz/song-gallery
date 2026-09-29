/**
 * Mis canciones como las ve la IA: las playlists del repo (menos la de
 * recomendaciones, que es de quienes escuchan) en una sola lista, sin repetir.
 *
 * La usan la búsqueda por ánimo, que elige de acá, y «Parecidas a esta», que la
 * lee como gusto de fondo y para no recomendar lo que ya tengo. Se arma una vez
 * cada 12 h y se guarda en Redis: son unas pocas llamadas a Spotify que no
 * tienen por qué repetirse en cada búsqueda.
 */
import { parsePlaylistId } from './_spotify.js';
import { fetchArtistDetails, normalizeTrack } from './_normalize.js';
import { kv } from './_kv.js';
import { catalogEntry, mergeCatalog } from './_mood.js';
import { fetchAllItems } from './playlist.js';
import { PLAYLISTS } from '../src/config/playlists.js';

const CATALOG_KEY = 'mood:catalog:v1';
const CATALOG_TTL = 12 * 3600;

export async function loadCatalog() {
  const cached = await kv('GET', CATALOG_KEY);
  if (cached) return JSON.parse(cached);

  const ids = PLAYLISTS.filter((item) => !item.recommend)
    .map((item) => parsePlaylistId(item.ref))
    .filter(Boolean);

  const lists = await Promise.all(
    ids.map(async (id) => {
      const items = await fetchAllItems(id);
      return items
        .map((item) => item?.track)
        .filter((track) => track?.id && track.type === 'track' && !track.is_local);
    }),
  );

  const all = lists.flat();
  const artists = await fetchArtistDetails(all.map((track) => track.artists?.[0]?.id));
  const catalog = mergeCatalog(
    lists.map((list) =>
      list.map((track) => catalogEntry(normalizeTrack(track, artists.get(track.artists?.[0]?.id)))),
    ),
  );

  await kv('SET', CATALOG_KEY, JSON.stringify(catalog), 'EX', String(CATALOG_TTL));
  return catalog;
}
