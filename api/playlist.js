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
import { pickArt, yearOf, fetchArtistDetails } from './_normalize.js';
import { rateLimited } from './_ratelimit.js';

const MAX_TRACKS = 200; // tope para que la funcion no se eternice en playlists enormes

const PLAYLIST_FIELDS =
  'id,name,description,images,external_urls(spotify),owner(display_name),tracks(total)';

const TRACK_FIELDS =
  'next,items(added_at,track(id,name,duration_ms,explicit,popularity,track_number,type,is_local,' +
  'external_ids(isrc),external_urls(spotify),' +
  'album(name,release_date,total_tracks,images,external_urls(spotify)),' +
  'artists(id,name,external_urls(spotify))))';

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
      /* Lo dice el servidor y no lo infiere el cliente: es el mismo campo con el
         que /api/album se distingue de esto, y quien pinta la cabecera no tiene
         por que deducirlo de la forma del payload. */
      kind: 'playlist',
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
