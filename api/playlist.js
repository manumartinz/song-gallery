/**
 * GET /api/playlist?ref=<url | spotify:playlist:ID | ID>
 *
 * Devuelve la playlist normalizada: metadata de Spotify enriquecida con los
 * generos del artista.
 *
 * NO resuelve las URLs de preview; de eso se encarga /api/previews por tramos.
 * Hacerlo aqui obligaba al primer visitante a esperar hasta 200 resoluciones
 * antes de ver una sola fila.
 */
import { parsePlaylistId, spotifyGet, SpotifyError } from './_spotify.js';
import { rateLimited } from './_ratelimit.js';

const MAX_TRACKS = 200; // tope para que la funcion no se eternice en playlists enormes

const PLAYLIST_FIELDS =
  'id,name,description,images,external_urls(spotify),owner(display_name),tracks(total)';

const TRACK_FIELDS =
  'next,items(added_at,track(id,name,duration_ms,explicit,popularity,track_number,type,is_local,' +
  'external_ids(isrc),external_urls(spotify),' +
  'album(name,release_date,total_tracks,images,external_urls(spotify)),' +
  'artists(id,name,external_urls(spotify))))';

/**
 * Spotify ordena las imagenes de mayor a menor: 640 / 300 / 64 px.
 *
 * La intermedia de 300 es la que de verdad necesitan la cuadricula y las filas.
 * Antes se descartaba y ambas vistas cargaban la de 640 para celdas de ~100 px.
 */
function pickArt(images) {
  const list = Array.isArray(images) ? images.filter(Boolean) : [];
  if (!list.length) return { lg: null, md: null, sm: null };

  const lg = list[0].url;
  const sm = list[list.length - 1].url;
  // Algunos albumes traen menos de tres tamaños: se cae hacia el grande.
  const md = list.length > 2 ? list[1].url : lg;

  return { lg, md, sm };
}

/** "2019-04-05" -> 2019. Spotify tambien devuelve solo el año en discos antiguos. */
function yearOf(releaseDate) {
  const year = Number(String(releaseDate || '').slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : null;
}

async function fetchAllItems(playlistId) {
  const items = [];
  let url = `/playlists/${playlistId}/tracks?limit=100&fields=${encodeURIComponent(TRACK_FIELDS)}`;

  while (url && items.length < MAX_TRACKS) {
    const page = await spotifyGet(url);
    items.push(...(page.items || []));
    url = page.next;
  }

  return items.slice(0, MAX_TRACKS);
}

/** Un solo GET /artists por cada 50 artistas: generos y seguidores del artista principal. */
async function fetchArtistDetails(artistIds) {
  const details = new Map();
  const unique = [...new Set(artistIds.filter(Boolean))];

  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const data = await spotifyGet(`/artists?ids=${chunk.join(',')}`);
    for (const artist of data.artists || []) {
      if (!artist) continue;
      details.set(artist.id, {
        genre: artist.genres?.[0] || null,
        followers: artist.followers?.total ?? null,
      });
    }
  }

  return details;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  // La web es publica: sin esto cualquiera puede vaciar la cuota de Spotify.
  if (rateLimited(req, res)) return;

  const playlistId = parsePlaylistId(req.query?.ref);
  if (!playlistId) {
    return res.status(400).json({
      error:
        'Link de playlist no válido. Pega una URL tipo https://open.spotify.com/playlist/... o el id de 22 caracteres.',
    });
  }

  try {
    const [playlist, items] = await Promise.all([
      spotifyGet(`/playlists/${playlistId}?fields=${encodeURIComponent(PLAYLIST_FIELDS)}`),
      fetchAllItems(playlistId),
    ]);

    // Fuera episodios de podcast, temas locales y huecos de temas retirados.
    const entries = items.filter(
      (item) => item?.track && item.track.id && item.track.type === 'track' && !item.track.is_local,
    );

    const artistDetails = await fetchArtistDetails(entries.map((e) => e.track.artists?.[0]?.id));

    const tracks = entries.map((entry) => {
      const track = entry.track;
      const artists = (track.artists || []).map((artist) => ({
        name: artist.name,
        url: artist.external_urls?.spotify || null,
      }));
      const primary = artistDetails.get(track.artists?.[0]?.id) || {};

      return {
        id: track.id,
        title: track.name,
        artists,
        artistLine: artists.map((a) => a.name).join(', '),
        album: track.album?.name || null,
        albumUrl: track.album?.external_urls?.spotify || null,
        albumTracks: track.album?.total_tracks ?? null,
        art: pickArt(track.album?.images),
        releaseDate: track.album?.release_date || null,
        year: yearOf(track.album?.release_date),
        durationMs: track.duration_ms ?? null,
        isrc: track.external_ids?.isrc || null,
        explicit: Boolean(track.explicit),
        popularity: track.popularity ?? null,
        trackNumber: track.track_number ?? null,
        genre: primary.genre || null,
        followers: primary.followers ?? null,
        addedAt: entry.added_at || null,
        spotifyUrl: track.external_urls?.spotify || null,
        /* previewUrl se deja AUSENTE a proposito: ausente = todavia sin
           resolver, null = resuelto y sin preview. Los rellena /api/previews. */
      };
    });

    // Cache en el edge de Vercel: las visitas repetidas ni tocan Spotify.
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    return res.status(200).json({
      id: playlist.id,
      name: playlist.name,
      description: (playlist.description || '').replace(/<[^>]*>/g, ''),
      owner: playlist.owner?.display_name || null,
      image: pickArt(playlist.images).lg,
      externalUrl: playlist.external_urls?.spotify || null,
      trackCount: tracks.length,
      totalCount: playlist.tracks?.total ?? tracks.length,
      tracks,
    });
  } catch (error) {
    const status = error instanceof SpotifyError ? error.status : 500;
    return res.status(status).json({ error: error.message || 'Error inesperado.' });
  }
}
