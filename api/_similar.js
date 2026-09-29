/**
 * «Parecidas a esta» sin red ni Redis: se prueba solo.
 *
 * La IA propone canciones NUEVAS por título y artista. Acá se descarta lo que
 * ya está en mis playlists, lo ya sugerido y lo repetido (`checkCandidates`),
 * y de lo que devuelve el buscador de Spotify se elige la pista que de verdad
 * es la propuesta (`bestMatch`): nada inventado llega a la web.
 */
import { clean, LIMITS, queryKey } from './_mood.js';

/* Cuántas se le piden a la IA y cuántas se enseñan: se pide de más porque
   alguna no aparece en Spotify con ese título y ese artista. */
export const SIMILAR = { ask: 6, show: 3, name: 120, avoid: 30 };

const mainArtist = (artist) => String(artist ?? '').split(/,| feat\.? | ft\.? | & | x /i)[0];

/** Título y artista principal a una clave comparable. */
export function songKey(title, artist) {
  return `${queryKey(title)}|${queryKey(mainArtist(artist))}`;
}

/**
 * Las propuestas de la IA, limpias: sin las que ya están en mis playlists, sin
 * las ya sugeridas para esta canción (`avoid`, claves de `songKey`) y sin
 * repetir. Todavía sin buscar en Spotify.
 */
export function checkCandidates(raw, catalog, avoid = []) {
  const taken = new Set([...catalog.map((entry) => songKey(entry.title, entry.artist)), ...avoid]);
  const out = [];

  for (const item of Array.isArray(raw?.picks) ? raw.picks : []) {
    const title = clean(item?.title, SIMILAR.name);
    const artist = clean(item?.artist, SIMILAR.name);
    if (!title || !artist) continue;
    const key = songKey(title, artist);
    if (taken.has(key)) continue;
    taken.add(key);
    out.push({ title, artist, why: clean(item.why, LIMITS.why) || null });
    if (out.length === SIMILAR.ask) break;
  }

  return out;
}

/**
 * De lo que devuelve el buscador de Spotify, la pista que de verdad es la que
 * propuso la IA: el artista tiene que coincidir y el título también, sin contar
 * la versión (así entra «Opus - Radio Edit» por «Opus», pero no «Opus Dei» ni
 * otra canción del mismo artista). `exclude` son los ids que no pueden salir:
 * mis playlists y lo ya elegido. Null si ninguna encaja.
 */
export function bestMatch(items, { title, artist }, exclude = new Set()) {
  const wantTitle = queryKey(title);
  const wantArtist = queryKey(mainArtist(artist));
  if (!wantTitle || !wantArtist) return null;

  return (
    (items || []).find((track) => {
      if (!track?.id || exclude.has(track.id)) return false;
      // Lo que va detrás de « - », «(» o «[» es la versión: remix, remaster, feat.
      const got = queryKey(String(track.name).split(/\s[-–—]\s|\s*[([]/)[0]);
      const titleOk = got === wantTitle;
      const artistOk = (track.artists || []).some((a) => {
        const name = queryKey(a.name);
        if (!name) return false;
        // «Calvin Harris» por «Calvin Harris & Disciples», pero no al revés:
        // «Eric» no es «Eric Prydz».
        return name === wantArtist || ` ${name} `.includes(` ${wantArtist} `);
      });
      return titleOk && artistOk;
    }) || null
  );
}
