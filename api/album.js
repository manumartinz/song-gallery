/**
 * GET /api/album?ref=<url | spotify:album:ID | ID>
 *
 * Devuelve un album con la MISMA forma que /api/playlist, y a proposito: asi el
 * cliente lo carga, lo ordena, lo filtra y lo reproduce con el motor que ya
 * tenia, sin una segunda ruta paralela para todo. Lo unico que los distingue es
 * el campo `kind`, que solo usa la cabecera para elegir las palabras.
 *
 * NO resuelve las URLs de preview; de eso se encarga /api/previews por tramos,
 * igual que con las playlists.
 */
import { parseAlbumId, spotifyGet, SpotifyError, NOT_FOUND } from './_spotify.js';
import { pickArt, yearOf, fetchArtistDetails, fetchFullTracks } from './_normalize.js';
import { rateLimited } from './_ratelimit.js';

/* Un disco doble largo cabe de sobra. Mas que esto ya es una recopilacion o una
   caja, y ninguna de las dos es lo que uno viene a escuchar aqui. */
const MAX_TRACKS = 100;

const OPTS = { notFound: NOT_FOUND.album };

/** Paginacion de /albums/{id}/tracks, que llega a 50 por pagina. */
async function fetchAllTracks(album) {
  const items = [...(album.tracks?.items || [])];
  let url = album.tracks?.next;

  while (url && items.length < MAX_TRACKS) {
    const page = await spotifyGet(url, OPTS);
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

  const albumId = parseAlbumId(req.query?.ref);
  if (!albumId) {
    return res.status(400).json({
      error:
        'Link de álbum no válido. Pega una URL tipo https://open.spotify.com/album/... o el id de 22 caracteres.',
    });
  }

  try {
    const album = await spotifyGet(`/albums/${albumId}`, OPTS);

    // Fuera pistas retiradas y las locales, igual que en una playlist.
    const simple = (await fetchAllTracks(album)).filter(
      (track) => track?.id && track.type === 'track' && !track.is_local,
    );

    /* El orden del disco es el que da sentido a `original`, que es como abre.
       Spotify ya los pagina en orden, pero dejarlo explicito hace que un album
       con varios discos no dependa de esa buena voluntad. */
    simple.sort(
      (a, b) =>
        (a.disc_number ?? 1) - (b.disc_number ?? 1) ||
        (a.track_number ?? 0) - (b.track_number ?? 0),
    );

    /* Las pistas de /albums vienen simplificadas: sin ISRC y sin popularidad.
       Se recuperan enteras y se cruzan POR ID, nunca por posicion. */
    const [full, artistDetails] = await Promise.all([
      fetchFullTracks(
        simple.map((track) => track.id),
        OPTS,
      ),
      fetchArtistDetails(
        simple.map((track) => track.artists?.[0]?.id),
        OPTS,
      ),
    ]);

    const art = pickArt(album.images);
    const albumUrl = album.external_urls?.spotify || null;
    const releaseDate = album.release_date || null;
    const year = yearOf(releaseDate);

    const tracks = simple.map((track) => {
      const detail = full.get(track.id);
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
        // Todas las pistas comparten album: es lo que significa ser un album.
        album: album.name,
        albumUrl,
        albumTracks: album.total_tracks ?? simple.length,
        art,
        releaseDate,
        year,
        durationMs: track.duration_ms ?? null,
        isrc: detail?.external_ids?.isrc || null,
        explicit: Boolean(track.explicit),
        popularity: detail?.popularity ?? null,
        trackNumber: track.track_number ?? null,
        discNumber: track.disc_number ?? 1,
        genre: primary.genre || null,
        followers: primary.followers ?? null,
        /* Un album no tiene fecha de añadido: no lo guardo yo cancion a cancion,
           salio entero el dia que salio. El cliente esconde ese criterio de
           orden cuando la fuente es un album. */
        addedAt: null,
        spotifyUrl: track.external_urls?.spotify || null,
        /* previewUrl se deja AUSENTE a proposito: ausente = todavia sin
           resolver, null = resuelto y sin preview. Los rellena /api/previews. */
      };
    });

    // Cache en el edge de Vercel: las visitas repetidas ni tocan Spotify.
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    return res.status(200).json({
      kind: 'album',
      id: album.id,
      name: album.name,
      description: null, // los albumes no traen; el sello va en su propio campo
      // `owner` es el hueco que la cabecera ya sabe pintar: aqui es el artista.
      owner: album.artists?.[0]?.name || null,
      label: album.label || null,
      releaseDate,
      year,
      image: art.lg,
      /* Los tres tamaños, no solo el grande: la cabecera la pinta a ~10 rem y
         con la de 640 pagaba una imagen de portada entera para eso. */
      art,
      externalUrl: albumUrl,
      trackCount: tracks.length,
      totalCount: album.total_tracks ?? tracks.length,
      tracks,
    });
  } catch (error) {
    const status = error instanceof SpotifyError ? error.status : 500;
    return res.status(status).json({ error: error.message || 'Error inesperado.' });
  }
}
