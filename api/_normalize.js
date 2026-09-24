/**
 * Piezas de normalizacion que comparten /api/playlist y /api/album.
 *
 * Vivian dentro de playlist.js hasta que aparecieron los albumes. Duplicarlas
 * habria sido peor que moverlas: son las que deciden la FORMA de la pista que
 * consume el cliente, y dos copias que se separen son dos vistas que dejan de
 * pintarse igual sin que nadie se entere.
 */
import { spotifyGet } from './_spotify.js';

/**
 * Spotify ordena las imagenes de mayor a menor: 640 / 300 / 64 px.
 *
 * La intermedia de 300 es la que de verdad necesitan la cuadricula y las filas.
 * Antes se descartaba y ambas vistas cargaban la de 640 para celdas de ~100 px.
 */
export function pickArt(images) {
  const list = Array.isArray(images) ? images.filter(Boolean) : [];
  if (!list.length) return { lg: null, md: null, sm: null };

  const lg = list[0].url;
  const sm = list[list.length - 1].url;
  // Algunos albumes traen menos de tres tamaños: se cae hacia el grande.
  const md = list.length > 2 ? list[1].url : lg;

  return { lg, md, sm };
}

/** "2019-04-05" -> 2019. Spotify tambien devuelve solo el año en discos antiguos. */
export function yearOf(releaseDate) {
  const year = Number(String(releaseDate || '').slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : null;
}

/** Un solo GET /artists por cada 50 artistas: generos y seguidores del artista principal. */
export async function fetchArtistDetails(artistIds, options) {
  const details = new Map();
  const unique = [...new Set(artistIds.filter(Boolean))];

  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const data = await spotifyGet(`/artists?ids=${chunk.join(',')}`, options);
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

/**
 * Recupera los objetos COMPLETOS de un puñado de pistas, indexados por id.
 *
 * Existe por los albumes: `GET /albums/{id}` devuelve pistas simplificadas, sin
 * `external_ids` (o sea sin ISRC) ni `popularity`. Sin el ISRC la resolucion de
 * previews pierde su unico camino exacto y se queda con la busqueda por texto,
 * que confunde remasterizaciones y versiones en directo. Una llamada por cada
 * 50 pistas es barata al lado de eso.
 */
export async function fetchFullTracks(trackIds, options) {
  const byId = new Map();
  const unique = [...new Set(trackIds.filter(Boolean))];

  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const data = await spotifyGet(`/tracks?ids=${chunk.join(',')}`, options);
    for (const track of data.tracks || []) {
      if (track?.id) byId.set(track.id, track);
    }
  }

  return byId;
}
