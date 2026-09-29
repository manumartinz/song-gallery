/**
 * Las fuentes que se pueden abrir —playlists del repo, las que pega el
 * visitante y los álbumes— y cómo se lee la que toca al entrar.
 *
 * Vivía dentro de App.jsx. Salió para poder probarla sin montar React: son
 * funciones puras sobre la config y el almacenamiento, y es justo donde un
 * cambio sin querer rompe enlaces compartidos o listas guardadas de visitantes.
 */
import { PLAYLISTS } from '../config/playlists.js';
import { ALBUMS } from '../config/albums.js';
import { MINE, parseMineRef } from '../config/mine.js';
import { parseAlbumRef, parsePlaylistRef } from './api.js';
import { SORTS } from './search.js';

const CUSTOM_KEY = 'song-gallery:custom';

/* Topes de las playlists que pega el visitante. Las del repo no los tienen: son
   la recomendacion, y se ven enteras.

   El de canciones no es una cifra estetica. Una playlist ajena de 200 pistas se
   lleva cinco tramos de previews (cinco funciones, doscientas resoluciones
   contra Deezer) y ~170 KB del almacenamiento del visitante, para algo que ni
   siquiera es lo que ha venido a ver. Con 49 son dos tramos, y el que quiera la
   suya entera la tiene a un click en Spotify. */
export const MAX_CUSTOM = 6;
export const CUSTOM_TRACKS = 49;

/**
 * Fusiona un tramo de previews en la playlist.
 *
 * Se cruza por ID DE PISTA y no por posicion: /api/playlist descarta episodios
 * y pistas locales, asi que las posiciones del cliente no coinciden con los
 * offsets de Spotify. Solo rellena lo que sigue sin resolver, para que un tramo
 * que llegue tarde no pise nada.
 */
export function mergePreviews(playlist, previews) {
  if (!previews.length) return playlist;

  const byId = new Map(previews.map((preview) => [preview.id, preview]));
  let changed = false;

  const tracks = playlist.tracks.map((track) => {
    const found = byId.get(track.id);
    if (!found || track.previewUrl !== undefined) return track;
    changed = true;
    return { ...track, previewUrl: found.previewUrl, previewSource: found.previewSource };
  });

  return changed ? { ...playlist, tracks } : playlist;
}

/** Normaliza la config del repo a entradas con id de playlist resuelto. */
export function toEntries(list) {
  return list
    .map((item) => {
      const id = parsePlaylistRef(item.ref);
      return id
        ? {
            id,
            label: item.label || 'Playlist',
            ref: item.ref,
            sort: item.sort,
            recommend: Boolean(item.recommend),
          }
        : null;
    })
    .filter(Boolean);
}

/**
 * Lo mismo para las que pega el visitante, que tienen otra forma.
 *
 * El nombre no se sabe al añadirlas —solo hay un link— asi que `label` nace en
 * null y se rellena cuando responde Spotify. `custom` es lo que luego decide
 * quien lleva su aspa para borrarla y a quien se le aplica el tope de pistas.
 *
 * El recorte a MAX_CUSTOM se hace tambien AQUI, al leer, y no solo al añadir:
 * en el navegador de quien ya paso por la web hay listas guardadas de antes de
 * que existiera el tope.
 */
export function toCustomEntries(list) {
  return (Array.isArray(list) ? list : [])
    .map((item) => {
      const id = parsePlaylistRef(item?.ref ?? item?.id);
      if (!id) return null;
      /* "Pegada" era la etiqueta fija de todas antes de que se les pusiera su
         nombre. Tratarla como "sin nombre" hace que quien ya tenga playlists
         guardadas reciba el nombre real la primera vez que las abra, en vez de
         quedarse con el rotulo viejo para siempre. */
      const label = item.label && item.label !== 'Pegada' ? item.label : null;
      return { id, label, ref: id, custom: true };
    })
    .filter(Boolean)
    .slice(0, MAX_CUSTOM);
}

export function persistCustom(list) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch {
    /* sin persistencia, sigue funcionando en esta sesion */
  }
}

export function readCustomEntries() {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    return raw ? toCustomEntries(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export const FIXED_ENTRIES = toEntries(PLAYLISTS);

/**
 * Criterio con el que abre cada playlist fija, declarado en la config del repo.
 *
 * Se resuelve desde PLAYLISTS y no desde `entries` a proposito: las playlists
 * que añade el visitante no traen configuracion, y meter `entries` en las
 * dependencias del efecto de carga lo volveria a disparar cada vez que alguien
 * añade una.
 */
export const DEFAULT_SORTS = new Map(
  FIXED_ENTRIES.filter((entry) => entry.sort && SORTS[entry.sort]).map((entry) => [
    entry.id,
    entry.sort,
  ]),
);

/* Los albumes del repo, resueltos una sola vez. El rotulo va al lado del id y no
   en dos listas paralelas: al descartar los links invalidos las posiciones
   dejarian de corresponderse y saldria el nombre de un disco debajo de otro. */
export function toAlbumEntries(list) {
  return list
    .map((item) => ({ id: parseAlbumRef(item.ref), label: item.label || 'Álbum' }))
    .filter((entry) => entry.id);
}

export const ALBUM_ENTRIES = toAlbumEntries(ALBUMS);

/* Las de mi cuenta, todas. Cuáles se enseñan lo decide /api/mine según los
   permisos del token; esto es sólo lo que existe. */
export const MINE_ENTRIES = MINE.map(({ id, label }) => ({ id, label }));

/* El parametro de la URL de cada clase de fuente. Son excluyentes: la URL
   lleva siempre uno solo. Lo leen la carga, la barra de direcciones, los
   enlaces al compartir y la canonica, y tienen que decir lo mismo. */
export const SOURCE_PARAMS = { playlist: 'p', album: 'a', me: 'm', mood: 'mood' };

/* La búsqueda por ánimo. Lo que escribe la persona es la frase, y aquí solo se
   descarta lo evidente: la valida de verdad /api/mood. Lo que viaja en
   `?mood=` no es la frase sino el id de la selección que armó la IA, para que
   un link compartido abra exactamente esa. */
export const MOOD_MAX = 80;
export function cleanMoodQuery(value) {
  const q = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MOOD_MAX);
  return q.length >= 3 ? q : null;
}

export function parseMoodRef(value) {
  const id = String(value ?? '').trim();
  return /^[a-z0-9]{10}$/.test(id) ? id : null;
}

export function paramFor(kind) {
  return SOURCE_PARAMS[kind] || SOURCE_PARAMS.playlist;
}

/* Con que abre la pagina. `?a=` gana a `?p=` porque son excluyentes y la URL
   siempre lleva sólo uno de los dos; que se miren en este orden sólo importa si
   alguien construye a mano un enlace con ambos.

   Que `?p=` siga significando lo mismo que antes no es un detalle: todos los
   enlaces compartidos hasta hoy lo llevan. */
export function readInitialSource(
  search = location.search,
  { playlists = FIXED_ENTRIES, custom = readCustomEntries(), albums = ALBUM_ENTRIES } = {},
) {
  const params = new URLSearchParams(search);

  const album = parseAlbumRef(params.get('a'));
  if (album) return { kind: 'album', id: album };

  const playlist = parsePlaylistRef(params.get('p'));
  if (playlist) return { kind: 'playlist', id: playlist };

  /* Se abre aunque el token no tenga el permiso: entonces la carga falla con
     su mensaje, que es mas honesto que caer en otra fuente sin decir nada. */
  const mine = parseMineRef(params.get('m'));
  if (mine) return { kind: 'me', id: mine };

  const mood = parseMoodRef(params.get('mood'));
  if (mood) return { kind: 'mood', id: mood };

  const first = [...playlists, ...custom][0];
  if (first) return { kind: 'playlist', id: first.id };

  // Sin playlists en la config, un álbum es mejor arranque que una página vacía.
  return albums.length ? { kind: 'album', id: albums[0].id } : { kind: 'playlist', id: null };
}
