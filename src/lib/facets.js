/**
 * Filtros rápidos de la barra de herramientas: género, década y "sin escuchar".
 *
 * Complementan al buscador, no lo reemplazan: escribir "rock" ya filtraba por
 * género, pero hacía falta saber qué géneros hay. Los chips lo enseñan.
 */

import { capitalize } from './format.js';

const MAX_GENRES = 6;
/* Un chip que deja una sola canción no filtra: señala. Por debajo de esto no
   se ofrece. */
const MIN_PER_CHIP = 2;

export const NO_FACETS = { genre: null, decade: null, unheard: false };

export function decadeOf(year) {
  return Number.isFinite(year) && year > 0 ? Math.floor(year / 10) * 10 : null;
}

/** "Años 90", "Años 2010". Como se dice, no como se escribe en un eje. */
export function decadeLabel(decade) {
  return decade < 2000 ? `Años ${String(decade).slice(2)}` : `Años ${decade}`;
}

/**
 * Qué chips ofrecer para una lista de pistas. Una dimensión con una sola
 * opción no sale: un chip de "Años 2020" en un disco de 2020 no filtra nada.
 */
export function facetOptions(tracks) {
  const genres = new Map();
  const decades = new Map();

  for (const track of tracks) {
    if (track.genre) genres.set(track.genre, (genres.get(track.genre) || 0) + 1);
    const decade = decadeOf(track.year);
    if (decade !== null) decades.set(decade, (decades.get(decade) || 0) + 1);
  }

  const genreList = [...genres]
    .filter(([, count]) => count >= MIN_PER_CHIP)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_GENRES)
    .map(([value]) => ({ value, label: capitalize(value) }));

  const decadeList = [...decades]
    .filter(([, count]) => count >= MIN_PER_CHIP)
    .sort((a, b) => a[0] - b[0])
    .map(([value]) => ({ value, label: decadeLabel(value) }));

  return {
    genres: genreList.length > 1 ? genreList : [],
    decades: decadeList.length > 1 ? decadeList : [],
  };
}

/**
 * Predicado para los filtros activos, o null si no hay ninguno.
 *
 * `unheard` puede ser una foto de las escuchadas tomada al encender el chip.
 * Es lo que usa la app: si mirase las escuchadas en vivo, la que suena se
 * marcaria a los diez segundos y desapareceria de la lista mientras suena.
 */
export function makeFacetFilter({ genre, decade, unheard }, heard) {
  if (!genre && decade === null && !unheard) return null;
  const seen = unheard instanceof Set ? unheard : heard;
  return (track) =>
    (!genre || track.genre === genre) &&
    (decade === null || decadeOf(track.year) === decade) &&
    (!unheard || !seen?.has(track.id));
}

export function hasFacets(facets) {
  return Boolean(facets.genre || facets.decade !== null || facets.unheard);
}
