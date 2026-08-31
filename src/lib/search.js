/** Normaliza para comparar: minusculas, sin acentos, sin puntuacion. */
function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/* El texto buscable de cada pista se calcula una sola vez. Los objetos de
   pista son estables mientras dure la playlist, asi que un WeakMap basta y se
   libera solo al cambiar de playlist. */
const haystacks = new WeakMap();

function haystack(track) {
  let value = haystacks.get(track);
  if (value === undefined) {
    value = normalize(
      [track.title, track.artistLine, track.album, track.year, track.genre]
        .filter(Boolean)
        .join(' '),
    );
    haystacks.set(track, value);
  }
  return value;
}

/**
 * Devuelve un predicado, o null si no hay nada que filtrar.
 *
 * Todos los terminos deben aparecer, no solo uno: asi "daft 2013" filtra por
 * artista y año a la vez, que es lo que uno espera al escribirlo.
 */
export function makeFilter(query) {
  const terms = normalize(query).split(' ').filter(Boolean);
  if (!terms.length) return null;
  return (track) => {
    const text = haystack(track);
    return terms.every((term) => text.includes(term));
  };
}

/**
 * Criterios de orden. `original` es el de la playlist, sin tocar.
 *
 * No estan ni popularidad ni duracion, y es deliberado: son metricas de la
 * plataforma y esto se presenta como una seleccion personal. `added` ocupa su
 * sitio con algo que si dice algo de quien la hizo: en que orden las guardo.
 *
 * `dir` es el sentido con el que entra cada criterio: en fechas se espera lo
 * ultimo primero, en nombres la A antes que la Z. Vive aqui y no en el
 * manejador del boton para que la config de playlists pueda arrancar con un
 * criterio ya puesto sin repetir la regla.
 */
export const SORTS = {
  original: { label: 'Original', compare: null, dir: 1 },
  year: { label: 'Año', compare: (a, b) => (a.year ?? 0) - (b.year ?? 0), dir: -1 },
  added: {
    label: 'Añadidas',
    dir: -1,
    /* `Date.parse` de null o de una fecha invalida da NaN, y un comparador que
       devuelve NaN deja el orden indefinido: se cae a 0, que las manda al
       principio (o al final, segun el sentido) en bloque. */
    compare: (a, b) => (Date.parse(a.addedAt) || 0) - (Date.parse(b.addedAt) || 0),
  },
  artist: {
    label: 'Artista',
    dir: 1,
    compare: (a, b) => normalize(a.artistLine).localeCompare(normalize(b.artistLine)),
  },
};
