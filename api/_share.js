/**
 * Qué dice un enlace compartido: título, descripción, portada.
 *
 * Lo usan la tarjeta (`/api/og`), la historia para Instagram (`/api/story`) y
 * el middleware que reescribe las etiquetas para los rastreadores. Los tres
 * tienen que contar lo mismo del mismo enlace, así que se decide una vez aquí.
 *
 * Corre en el edge: nada de Node (ni Buffer ni fs).
 */
import { spotifyGet, parseAlbumId, parsePlaylistId, NOT_FOUND } from './_spotify.js';
import { pickArt } from './_normalize.js';
import { noteFor } from '../src/config/notes.js';

export const SITE = 'Manu A. Martínez';
export const SITE_TITLE = `Música · ${SITE}`;
export const SITE_DESCRIPTION =
  'Canciones que recomiendo. No es un reproductor: es una selección mía, en fragmentos.';

const TRACK_ID = /^[A-Za-z0-9]{22}$/;

/** Los parámetros de un enlace de la web: ?p=, ?a= y ?t=. */
export function readShareParams(searchParams) {
  const album = parseAlbumId(searchParams.get('a'));
  const playlist = album ? null : parsePlaylistId(searchParams.get('p'));
  const t = searchParams.get('t');
  return {
    kind: album ? 'album' : playlist ? 'playlist' : null,
    id: album || playlist,
    trackId: t && TRACK_ID.test(t) ? t : null,
  };
}

async function sourceName({ kind, id }) {
  if (!id) return null;
  try {
    if (kind === 'album') {
      const album = await spotifyGet(`/albums/${id}`, { notFound: NOT_FOUND.album });
      return {
        name: album.name,
        owner: album.artists?.[0]?.name || null,
        art: pickArt(album.images),
      };
    }
    const playlist = await spotifyGet(
      `/playlists/${id}?fields=${encodeURIComponent('name,images,owner(display_name)')}`,
    );
    return {
      name: playlist.name,
      owner: playlist.owner?.display_name || null,
      art: pickArt(playlist.images),
    };
  } catch {
    return null;
  }
}

/**
 * Lo que hay que enseñar de un enlace. Nunca rechaza: si Spotify no contesta,
 * devuelve lo de la web en general, que es lo que se veía hasta ahora.
 */
export async function describeShare(params) {
  const fallback = { title: SITE_TITLE, description: SITE_DESCRIPTION, kind: 'site' };

  if (params.trackId) {
    try {
      const [track, source] = await Promise.all([
        spotifyGet(`/tracks/${params.trackId}`),
        sourceName(params),
      ]);
      const artist = (track.artists || []).map((a) => a.name).join(', ');
      const note = noteFor(track.id);
      const from = source?.name ? ` de «${source.name}»` : '';
      return {
        kind: 'track',
        title: `${track.name} — ${artist}`,
        description: note || `Una canción${from} que recomiendo. Escuchala acá.`,
        trackTitle: track.name,
        artist,
        note,
        sourceName: source?.name || null,
        art: pickArt(track.album?.images),
      };
    } catch {
      /* pista que ya no existe: se cae a la fuente, o a la web */
    }
  }

  const source = await sourceName(params);
  if (!source) return fallback;

  const isAlbum = params.kind === 'album';
  return {
    kind: params.kind,
    title: `${source.name} · ${SITE}`,
    description: isAlbum
      ? `${source.name}${source.owner ? `, de ${source.owner}` : ''}: uno de mis discos favoritos.`
      : `«${source.name}», una playlist mía. Escuchala acá, en fragmentos.`,
    sourceName: source.name,
    owner: source.owner,
    art: source.art,
  };
}

const CRAWLERS =
  /facebookexternalhit|facebookcatalog|whatsapp|twitterbot|slackbot|telegrambot|discordbot|linkedinbot|pinterest|redditbot|skypeuripreview|applebot|googlebot|bingbot|embedly|vkshare|iframely|mastodon|signal|bluesky|snapchat|instagram/i;

/** Rastreadores que leen las etiquetas para armar la vista previa. */
export function isCrawler(userAgent) {
  return CRAWLERS.test(userAgent || '');
}

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Reescribe en el HTML las etiquetas de la tarjeta. Cambia el contenido de las
 * que ya hay, no añade: index.html sigue siendo la única fuente de cuáles son.
 */
export function injectMeta(html, { title, description, url, image }) {
  const set = (attr, key, value) => {
    const pattern = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, 'i');
    html = html.replace(pattern, `$1${escapeAttr(value)}$2`);
  };

  set('property', 'og:title', title);
  set('property', 'og:description', description);
  set('name', 'description', description);
  if (url) set('property', 'og:url', url);
  if (image) set('property', 'og:image', image);
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeAttr(title)}</title>`);
  return html;
}
