import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Backdrop from './components/Backdrop.jsx';
import Footer from './components/Footer.jsx';
import MiniPlayer from './components/MiniPlayer.jsx';
import PlaylistMenu from './components/PlaylistMenu.jsx';
import Splash from './components/Splash.jsx';
import TrackGrid from './components/TrackGrid.jsx';
import TrackList from './components/TrackList.jsx';
import MoreOnSpotify from './components/MoreOnSpotify.jsx';
import Toolbar from './components/Toolbar.jsx';
import ViewToggle from './components/ViewToggle.jsx';
import { EmptyState, ErrorState, LoadingList, NoMatches } from './components/States.jsx';
import { PLAYLISTS } from './config/playlists.js';
import {
  cachePlaylist,
  dropPlaylistCache,
  fetchPlaylist,
  fetchPreviews,
  parsePlaylistRef,
} from './lib/api.js';
import { dominantColor } from './lib/color.js';
import { makeFilter, SORTS } from './lib/search.js';
import useDragScroll from './hooks/useDragScroll.js';
import usePlayer from './hooks/usePlayer.js';
import useReducedMotion from './hooks/useReducedMotion.js';
import useRowRegistry from './hooks/useRowRegistry.js';
import useSticky from './hooks/useSticky.js';

const CUSTOM_KEY = 'song-gallery:custom';
const VIEW_KEY = 'song-gallery:view';
const INTRO_KEY = 'song-gallery:intro-seen'; // lo escribe Splash; aqui solo se consulta
const PREVIEW_CHUNK = 40; // tramo con el que se van pidiendo los previews

/* Topes de las playlists que pega el visitante. Las del repo no los tienen: son
   la recomendacion, y se ven enteras.

   El de canciones no es una cifra estetica. Una playlist ajena de 200 pistas se
   lleva cinco tramos de previews (cinco funciones, doscientas resoluciones
   contra Deezer) y ~170 KB del almacenamiento del visitante, para algo que ni
   siquiera es lo que ha venido a ver. Con 49 son dos tramos, y el que quiera la
   suya entera la tiene a un click en Spotify. */
const MAX_CUSTOM = 6;
const CUSTOM_TRACKS = 49;

/**
 * Fusiona un tramo de previews en la playlist.
 *
 * Se cruza por ID DE PISTA y no por posicion: /api/playlist descarta episodios
 * y pistas locales, asi que las posiciones del cliente no coinciden con los
 * offsets de Spotify. Solo rellena lo que sigue sin resolver, para que un tramo
 * que llegue tarde no pise nada.
 */
function mergePreviews(playlist, previews) {
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
function toEntries(list) {
  return list
    .map((item) => {
      const id = parsePlaylistRef(item.ref);
      return id ? { id, label: item.label || 'Playlist', ref: item.ref, sort: item.sort } : null;
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
function toCustomEntries(list) {
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

function persistCustom(list) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
  } catch {
    /* sin persistencia, sigue funcionando en esta sesion */
  }
}

/**
 * Criterio con el que abre cada playlist fija, declarado en la config del repo.
 *
 * Se resuelve desde PLAYLISTS y no desde `entries` a proposito: las playlists
 * que añade el visitante no traen configuracion, y meter `entries` en las
 * dependencias del efecto de carga lo volveria a disparar cada vez que alguien
 * añade una.
 */
const DEFAULT_SORTS = new Map(
  toEntries(PLAYLISTS)
    .filter((entry) => entry.sort && SORTS[entry.sort])
    .map((entry) => [entry.id, entry.sort]),
);

function readCustomEntries() {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    return raw ? toCustomEntries(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const reducedMotion = useReducedMotion();

  const fixedEntries = useMemo(() => toEntries(PLAYLISTS), []);
  const [customEntries, setCustomEntries] = useState(readCustomEntries);
  const entries = useMemo(() => {
    const seen = new Set();
    return [...fixedEntries, ...customEntries].filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
  }, [fixedEntries, customEntries]);

  /* Guardar aqui y no dentro de los updaters de setCustomEntries: son tres los
     que la tocan (añadir, ponerle nombre y borrar), y un efecto secundario
     dentro de una funcion que React puede invocar dos veces se multiplicaria
     por tres. Esto lo escribe una sola vez por cambio, y el de mas al montar
     reescribe lo mismo que se acaba de leer. */
  useEffect(() => {
    persistCustom(customEntries);
  }, [customEntries]);

  // La playlist inicial sale de ?p= para que la vista sea compartible.
  const [currentId, setCurrentId] = useState(() => {
    const fromUrl = parsePlaylistRef(new URLSearchParams(location.search).get('p'));
    if (fromUrl) return fromUrl;
    const initial = [...toEntries(PLAYLISTS), ...readCustomEntries()][0];
    return initial ? initial.id : null;
  });

  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  });

  /* Saludo de bienvenida: una sola vez por navegador. `?intro` lo fuerza, que es
     la unica forma de volver a verlo una vez marcado. */
  const [showSplash, setShowSplash] = useState(() => {
    if (new URLSearchParams(location.search).has('intro')) return true;
    try {
      return !localStorage.getItem(INTRO_KEY);
    } catch {
      return true; // sin almacenamiento gana la intencion de dar la bienvenida
    }
  });
  // Estable a proposito: Splash lo usa como dependencia de su temporizador.
  const dismissSplash = useCallback(() => setShowSplash(false), []);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [touched, setTouched] = useState(false);

  /* Dos conceptos distintos, antes mezclados en uno solo:
     - hover / teclado -> solo resalta la fila.
     - playingIndex    -> la cancion que suena: es la unica que se expande con
       su ficha, muestra el ecualizador y pinta el fondo. */
  const [hoverIndex, setHoverIndex] = useState(null);
  const [keyIndex, setKeyIndex] = useState(0);
  const [playingIndex, setPlayingIndex] = useState(-1);
  /* La fila con la ficha desplegada. Normalmente es la que suena, pero un tema
     sin preview tambien se puede abrir para leer su informacion sin que llegue
     a reproducirse: son dos cosas distintas. */
  const [selectedIndex, setSelectedIndex] = useState(-1);
  /* Pistas que el reproductor no consiguio arrancar (enlace caido, bloqueo por
     region). Se tratan igual que las que ya vienen sin preview. */
  const [unplayable, setUnplayable] = useState(() => new Set());

  /* Pista que se ha clicado antes de que su preview estuviese resuelto: se
     reproduce sola en cuanto llega. -1 = nada esperando. */
  const [playWhenReady, setPlayWhenReady] = useState(-1);

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('original');
  const [sortDir, setSortDir] = useState(1);

  const tracks = useMemo(() => data?.tracks ?? [], [data]);
  const focusedIndex = hoverIndex ?? keyIndex;
  const currentTrack = tracks[playingIndex] || null;

  /* Cuantas canciones se enseñan de la playlist que se esta viendo. Las del
     repo, todas; las pegadas, hasta CUSTOM_TRACKS. */
  const trackLimit = useMemo(
    () => (entries.find((entry) => entry.id === currentId)?.custom ? CUSTOM_TRACKS : Infinity),
    [entries, currentId],
  );

  /* Lo que se ve, ya filtrado y ordenado. Cada entrada conserva su indice
     ORIGINAL: esa es la identidad con la que trabaja todo el estado (que suena,
     que esta abierta, cuales fallaron, el mapa de nodos). Si el estado fuese por
     posicion visible, filtrar u ordenar lo descuadraria todo de golpe. */
  const visible = useMemo(() => {
    const filter = makeFilter(query);
    let items = tracks.map((track, index) => ({ track, index }));

    if (filter) items = items.filter((item) => filter(item.track));

    const compare = SORTS[sortBy]?.compare;
    if (compare) {
      items = [...items].sort((a, b) => compare(a.track, b.track) * sortDir);
    } else if (sortDir === -1) {
      items = [...items].reverse();
    }

    /* El tope de las pegadas se aplica AQUI, al final y no al cargar, por dos
       razones: se corta lo que se ve y no lo que se tiene (buscar sigue mirando
       la playlist entera, y luego se queda con las 49 primeras que encajen), y
       todo lo demas —teclado, findPlayable, "al azar", el registro de filas—
       ya trabaja sobre `visible` y hereda el corte sin enterarse. */
    return items.length > trackLimit ? items.slice(0, trackLimit) : items;
  }, [tracks, query, sortBy, sortDir, trackLimit]);

  const { register, scrollTo, getNode } = useRowRegistry();
  const { onPointerDown, wasDragged } = useDragScroll({ enabled: !reducedMotion });
  const [sentinelRef, titleStuck] = useSticky();

  // Rompe el ciclo entre los saltos de pista y el player, que se necesitan mutuamente.
  const playRef = useRef(null);

  /* `previewUrl` tiene tres estados, y la diferencia importa:
       undefined -> aun sin resolver; la fila NO debe verse apagada
       null      -> resuelto y sin preview en ningun catalogo
       string    -> reproducible */
  const isPending = useCallback(
    (index) => Boolean(tracks[index]) && tracks[index].previewUrl === undefined,
    [tracks],
  );

  const isPlayable = useCallback(
    (index) => typeof tracks[index]?.previewUrl === 'string' && !unplayable.has(index),
    [tracks, unplayable],
  );

  /**
   * Siguiente (o anterior) pista reproducible, recorriendo el ORDEN VISIBLE
   * para que saltar siga lo que se ve, pero devolviendo el indice original.
   */
  const findPlayable = useCallback(
    (from, step) => {
      const at = visible.findIndex((item) => item.index === from);
      // Si lo que suena esta filtrado fuera, se entra por el extremo que toque.
      const start = at === -1 ? (step > 0 ? -1 : visible.length) : at;

      for (let slot = start + step; slot >= 0 && slot < visible.length; slot += step) {
        if (isPlayable(visible[slot].index)) return visible[slot].index;
      }
      return -1;
    },
    [visible, isPlayable],
  );

  /** Arranca un tema por indice y lo centra en pantalla. */
  const startTrack = useCallback(
    (index) => {
      const track = tracks[index];
      if (!isPlayable(index)) return;
      setTouched(true);
      setPlayingIndex(index);
      setSelectedIndex(index); // al sonar, su ficha pasa a ser la abierta
      setKeyIndex(index);
      // El indice desambigua playlists con la misma cancion repetida, donde el
      // id se repite y el reproductor la confundiria con la que ya suena.
      playRef.current?.(track, index);
      scrollTo(index);
    },
    [tracks, isPlayable, scrollTo],
  );

  /* Cuando la pista que estaba esperando termina de resolverse, arranca sola.
     Cubre por igual la peticion prioritaria y el tramo secuencial: gana el que
     llegue antes. */
  useEffect(() => {
    if (playWhenReady === -1) return;
    const track = tracks[playWhenReady];
    if (!track || track.previewUrl === undefined) return; // sigue pendiente

    setPlayWhenReady(-1);
    if (typeof track.previewUrl === 'string') startTrack(playWhenReady);
  }, [playWhenReady, tracks, startTrack]);

  /** Adelanta el tramo que contiene una pista concreta, sin esperar su turno. */
  const resolveNow = useCallback(
    async (index) => {
      if (!currentId) return;
      try {
        // Ventana alrededor del indice: como se cruza por id, basta con que la
        // pista caiga dentro aunque el offset de Spotify no cuadre exacto.
        const previews = await fetchPreviews(currentId, Math.max(0, index - 2), 10);
        setData((prev) => (prev ? mergePreviews(prev, previews) : prev));
      } catch {
        // Da igual: el recorrido secuencial acabara cubriendola.
      }
    },
    [currentId],
  );

  const skip = useCallback(
    (step) => {
      const next = findPlayable(playingIndex, step);
      if (next !== -1) startTrack(next);
    },
    [findPlayable, playingIndex, startTrack],
  );

  const player = usePlayer({
    crossfade: !reducedMotion,
    onEnded: () => skip(1),
  });
  playRef.current = player.play;

  const { play, toggle, seek, stop, preload, getPosition } = player;

  /* Calienta la cache con el tema siguiente para que el avance automatico
     entre sin hueco. Va por un elemento aparte, no por los decks. */
  useEffect(() => {
    if (playingIndex === -1) return;
    const next = findPlayable(playingIndex, 1);
    if (next !== -1) preload(tracks[next]?.previewUrl);
  }, [playingIndex, findPlayable, tracks, preload]);

  /* ---------- Carga de la playlist ---------- */

  useEffect(() => {
    if (!currentId) {
      setData(null);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    stop();
    setPlayingIndex(-1);
    setSelectedIndex(-1);
    setUnplayable(new Set());
    retriedKeys.current = new Set();
    setHoverIndex(null);
    setKeyIndex(0);
    /* Playlist nueva, criterios en blanco: mantenerlos confundiria mas que
       ayudar. "En blanco" es el orden que declare la config, y `original` para
       las que no declaren ninguno. */
    setQuery('');
    const initialSort = DEFAULT_SORTS.get(currentId) ?? 'original';
    setSortBy(initialSort);
    setSortDir(SORTS[initialSort].dir);

    /* Los previews llegan despues, por tramos, para que la lista aparezca en
       cuanto responde Spotify en vez de esperar a 200 resoluciones. Vive dentro
       de este efecto a proposito: su ciclo de vida es el de la playlist, y el
       mismo AbortController lo corta al cambiar de una a otra. */
    const streamPreviews = async (payload) => {
      if (payload.tracks.every((track) => track.previewUrl !== undefined)) return;

      /* `trackCount` es lo que el server MANDO; `totalCount` es lo que tiene la
         playlist en Spotify, que puede ser mucho mas porque /api/playlist corta
         en 200. Recorrer el segundo era pedir tramos de canciones que no estan
         en el payload: con una playlist de 5.000 salian 125 peticiones de las
         que servian 5, y `mergePreviews` tiraba el resto por no encontrar los
         ids. Ademas reventaba el limite por IP y dejaba al visitante sin poder
         cargar nada durante diez minutos.

         El tope de las pegadas entra tambien aqui: si solo se enseñan 49, pedir
         previews de la 50 en adelante es gastar por gusto. */
      const total = Math.min(payload.trackCount ?? payload.tracks.length, trackLimit);
      let merged = payload;

      for (let offset = 0; offset < total; offset += PREVIEW_CHUNK) {
        if (controller.signal.aborted) return;

        try {
          const previews = await fetchPreviews(currentId, offset, PREVIEW_CHUNK, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;

          merged = mergePreviews(merged, previews);
          setData((prev) => (prev && prev.id === payload.id ? mergePreviews(prev, previews) : prev));
        } catch (cause) {
          if (controller.signal.aborted || cause.name === 'AbortError') return;
          /* Un 429 no es un tramo que ha fallado, es el limite por IP diciendo
             que pares: seguir pidiendo solo consume la ventana entera para que
             la siguiente playlist tampoco cargue. Los demas errores si son de
             su tramo y no deben tumbar a los otros. */
          if (cause.status === 429) return;
        }
      }

      // Completa: se cachea ya fusionada para que la proxima visita no repita.
      if (!controller.signal.aborted) cachePlaylist(currentId, merged);
    };

    fetchPlaylist(currentId, { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setData(payload);
        window.scrollTo({ top: 0, behavior: 'instant' });
        streamPreviews(payload);
      })
      .catch((cause) => {
        if (controller.signal.aborted || cause.name === 'AbortError') return;
        setError(cause.message);
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    /* `trackLimit` es un numero, no un objeto: solo cambia de valor al pasar de
       una playlist del repo a una pegada, y eso ya trae un `currentId` nuevo.
       Ponerlo aqui no dispara recargas de mas. */
  }, [currentId, stop, trackLimit]);

  /* Mantiene ?p= y ?t= sincronizados sin ensuciar el historial, para que la
     barra de direcciones sea siempre un enlace valido de lo que se esta viendo:
     ?p= la playlist, ?t= la cancion que suena. */
  useEffect(() => {
    const url = new URL(location.href);

    if (currentId) url.searchParams.set('p', currentId);
    else url.searchParams.delete('p');

    if (currentTrack?.id) url.searchParams.set('t', currentTrack.id);
    else url.searchParams.delete('t');

    history.replaceState(null, '', url);
  }, [currentId, currentTrack]);

  /* Cancion pedida por ?t= al entrar. Se guarda en una ref y se consume UNA
     vez: a partir de ahi la URL la escribimos nosotros con lo que suena, y
     volver a leerla nos devolveria a la de partida en cada cambio. */
  const deepLinkRef = useRef(new URLSearchParams(location.search).get('t'));

  useEffect(() => {
    const wanted = deepLinkRef.current;
    if (!wanted || !tracks.length) return;
    deepLinkRef.current = null;

    const index = tracks.findIndex((track) => track.id === wanted);
    if (index === -1) return; // el enlace no es de esta playlist

    /* Se abre la ficha y se centra, pero NO se reproduce. No es una decision
       estetica: el navegador bloquea el audio sin un gesto previo, play()
       rechazaria con NotAllowedError, y usePlayer solo perdona AbortError -- el
       resto marca la pista como muerta y salta a la siguiente. Un enlace
       compartido se autodestruiria nada mas abrirlo. La fila ya muestra su
       triangulo de play, que es invitacion suficiente. */
    setSelectedIndex(index);
    setKeyIndex(index);
    scrollTo(index, 'instant');
  }, [tracks, scrollTo]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* sin persistencia, sigue funcionando en esta sesion */
    }
  }, [view]);

  /* ---------- Visibilidad de la fila activa ---------- */

  /* El mini-reproductor solo asoma cuando la fila que suena se ha ido de
     pantalla. Hace falta visibilidad VIVA en los dos sentidos, asi que no vale
     `useInView`, que a proposito no vuelve atras una vez visible. */
  const [activeRowVisible, setActiveRowVisible] = useState(true);

  useEffect(() => {
    if (playingIndex === -1) {
      setActiveRowVisible(true); // nada suena: nada que mostrar abajo
      return undefined;
    }

    const node = getNode(playingIndex);
    if (!node) {
      // Filtrada u ordenada fuera: no hay fila a la vista, manda el mini.
      setActiveRowVisible(false);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setActiveRowVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
    /* `view` y `visible` estan aqui porque el NODO cambia con ellos: conmutar
       lista/cuadricula o filtrar remonta las filas y deja al observer mirando
       un elemento que ya no esta en el documento. */
  }, [playingIndex, getNode, view, visible]);

  /* ---------- Acento cromatico: lo manda la cancion que suena ---------- */

  useEffect(() => {
    const source = currentTrack?.art?.sm || currentTrack?.art?.lg;
    if (!source) return undefined;

    let cancelled = false;
    dominantColor(source).then((color) => {
      if (cancelled) return;
      // Solo hay version translucida si salio un rgb(); el fallback es hex.
      const soft = color.startsWith('rgb(')
        ? color.replace('rgb(', 'rgba(').replace(')', ', 0.2)')
        : 'rgba(244, 241, 234, 0.16)';
      document.documentElement.style.setProperty('--accent', color);
      document.documentElement.style.setProperty('--accent-soft', soft);
    });

    return () => {
      cancelled = true;
    };
  }, [currentTrack]);

  /* ---------- Metadatos para los controles del sistema ---------- */

  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artistLine,
      album: currentTrack.album || '',
      artwork: currentTrack.art?.lg
        ? [{ src: currentTrack.art.lg, sizes: '640x640', type: 'image/jpeg' }]
        : [],
    });
    navigator.mediaSession.playbackState = player.isPlaying ? 'playing' : 'paused';
  }, [currentTrack, player.isPlaying]);

  /* ---------- Interaccion ---------- */

  const handleSelect = useCallback(
    (index) => {
      if (wasDragged()) return; // fue un arrastre, no un click
      const track = tracks[index];
      if (!track) return;

      /* Aun sin resolver: se abre su ficha, se adelanta su tramo y se deja
         anotada para que arranque en cuanto llegue el preview. */
      if (isPending(index)) {
        setTouched(true);
        setSelectedIndex(index);
        setKeyIndex(index);
        setPlayWhenReady(index);
        resolveNow(index);
        return;
      }

      /* Sin preview: se abre su ficha para poder leerla igualmente. No
         interrumpe lo que este sonando ni cambia el fondo, que sigue atado a
         lo que se oye. */
      if (!isPlayable(index)) {
        setSelectedIndex(index);
        setKeyIndex(index);
        return;
      }

      // Click sobre la que ya suena: pausa/reanuda en vez de reiniciarla.
      if (index === playingIndex) {
        setTouched(true);
        setSelectedIndex(index);
        toggle();
        return;
      }
      startTrack(index);
    },
    [wasDragged, tracks, playingIndex, toggle, startTrack, isPending, isPlayable, resolveNow],
  );

  const handleHover = useCallback((index) => setHoverIndex(index), []);

  /* Cada criterio entra con el sentido que uno espera: los años y las ultimas
     añadidas de mas reciente a mas antiguo, el artista alfabetico. Volver a
     pulsar el criterio activo invierte el sentido. */
  const handleSort = useCallback(
    (key) => {
      if (key === sortBy) {
        setSortDir((direction) => -direction);
        return;
      }
      setSortBy(key);
      setSortDir(SORTS[key]?.dir ?? 1);
    },
    [sortBy],
  );

  /** Sortea entre los temas que si tienen preview, para que siempre suene. */
  const handleRandom = useCallback(() => {
    // Sortea solo entre lo VISIBLE: si has filtrado, el azar respeta el filtro.
    const playable = visible.map((item) => item.index).filter(isPlayable);
    if (!playable.length) return;

    const pool = playable.length > 1 ? playable.filter((i) => i !== playingIndex) : playable;
    startTrack(pool[Math.floor(Math.random() * pool.length)]);
  }, [visible, isPlayable, playingIndex, startTrack]);

  /* Si una pista falla de verdad al arrancar, se marca como no reproducible y
     se salta a la siguiente. Sin esto la app seguia creyendo que sonaba (el
     playingIndex se fija antes de confirmar), y el siguiente click sobre ella
     iba a toggle() en vez de a play(): de ahi que se quedase pegada. */
  const failStreak = useRef(0);
  const handledFailure = useRef(null);
  const retriedKeys = useRef(new Set());

  /** Devuelve una pista al estado "pendiente" para que se vuelva a resolver. */
  const expirePreview = useCallback((index) => {
    setData((prev) => {
      if (!prev) return prev;
      const tracks = prev.tracks.map((track, i) => {
        if (i !== index) return track;
        const { previewUrl, previewSource, ...rest } = track;
        return rest; // sin previewUrl = pendiente
      });
      return { ...prev, tracks };
    });
  }, []);

  useEffect(() => {
    if (player.isPlaying) {
      failStreak.current = 0;
      handledFailure.current = null;
    }
  }, [player.isPlaying]);

  useEffect(() => {
    const failed = player.failedKey;
    if (player.error == null || failed == null) return;
    // Marcar la pista cambia `unplayable`, lo que rehace findPlayable y vuelve
    // a disparar este efecto: sin esta guarda saltaria dos veces por fallo.
    if (handledFailure.current === failed) return;
    handledFailure.current = failed;

    /* Las URLs de preview van firmadas y caducan a los ~15 minutos, asi que lo
       primero que hay que descartar es que esta simplemente se haya quedado
       vieja (una pestaña abierta un rato basta). Se vuelve a resolver y se
       reintenta UNA vez antes de dar la pista por muerta. */
    if (!retriedKeys.current.has(failed)) {
      retriedKeys.current.add(failed);
      expirePreview(failed);
      setPlayWhenReady(failed);
      resolveNow(failed);
      return;
    }

    setUnplayable((prev) => {
      if (prev.has(failed)) return prev;
      const next = new Set(prev);
      next.add(failed);
      return next;
    });
    setPlayingIndex(-1);

    // Guardarrail: si fallan varias seguidas no recorremos la lista sola.
    failStreak.current += 1;
    if (failStreak.current > 3) return;

    const next = findPlayable(failed, 1);
    if (next !== -1) startTrack(next);
  }, [player.error, player.failedKey, findPlayable, startTrack, expirePreview, resolveNow]);

  useEffect(() => {
    const onKeyDown = (event) => {
      // No robar teclas mientras se escribe o se ajusta la barra.
      if (event.target.closest?.('input, textarea, [role="slider"]')) return;

      // El cursor tambien se mueve por el orden visible, no por el original.
      const step = (delta) => {
        event.preventDefault();
        if (!visible.length) return;

        const at = visible.findIndex((item) => item.index === focusedIndex);
        const slot = Math.min(visible.length - 1, Math.max(0, (at === -1 ? 0 : at) + delta));
        const next = visible[slot].index;

        setHoverIndex(null);
        setKeyIndex(next);
        scrollTo(next);
      };

      switch (event.key) {
        case 'ArrowDown':
        case 'j':
          step(1);
          break;
        case 'ArrowUp':
        case 'k':
          step(-1);
          break;
        case 'Enter':
          event.preventDefault();
          handleSelect(focusedIndex);
          break;
        case ' ':
          event.preventDefault();
          setTouched(true);
          if (player.trackId) toggle();
          else handleSelect(focusedIndex);
          break;
        case 'ArrowRight':
          if (player.trackId) seek(getPosition() + 5);
          break;
        case 'ArrowLeft':
          if (player.trackId) seek(getPosition() - 5);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    /* La posicion se lee al vuelo con getPosition() y NO esta en las
       dependencias: tenerla ahi volvia a registrar este listener global veinte
       veces por segundo mientras sonaba algo. */
  }, [focusedIndex, visible, scrollTo, handleSelect, toggle, seek, getPosition, player.trackId]);

  /**
   * Devuelve el motivo del rechazo, o null si la playlist entro.
   *
   * Devolver el mensaje en vez de llamar a setError es a proposito: setError
   * cambia la pagina entera por ErrorState, asi que avisar de un link mal
   * pegado borraba de la pantalla la playlist que se estuviera escuchando. El
   * menu pinta esto junto al campo, donde se ha cometido el error.
   */
  const handleAddPlaylist = useCallback(
    (value) => {
      const id = parsePlaylistRef(value);
      if (!id) return 'Ese link no parece una playlist de Spotify.';

      /* Si es una de las de la casa se va a ella y no se guarda nada. Sin esto
         ocupaba un hueco del tope: `entries` deduplica, asi que la copia no
         llegaba a salir en el menu y no habia aspa con la que recuperarlo. */
      if (fixedEntries.some((entry) => entry.id === id)) {
        setCurrentId(id);
        return null;
      }

      const known = customEntries.some((entry) => entry.id === id);
      if (!known && customEntries.length >= MAX_CUSTOM) {
        return `Solo caben ${MAX_CUSTOM} playlists pegadas. Quitá una para añadir otra.`;
      }

      // Repetir una que ya esta no es un error: se va a ella y ya.
      if (!known) setCustomEntries((prev) => [...prev, { id, label: null, ref: id, custom: true }]);
      setCurrentId(id);
      return null;
    },
    [customEntries, fixedEntries],
  );

  /**
   * Quita una playlist pegada.
   *
   * Se lleva por delante su copia en cache: al desaparecer del menu ya no hay
   * ninguna ocasion de releerla, asi que sus ~170 KB se quedarian ocupados
   * hasta que alguien vaciase el almacenamiento a mano.
   */
  const handleRemovePlaylist = useCallback(
    (id) => {
      setCustomEntries((prev) => prev.filter((entry) => entry.id !== id));
      dropPlaylistCache(id);
      // Si era la que se estaba viendo hay que ir a alguna parte: la primera.
      setCurrentId((prev) => (prev === id ? (fixedEntries[0]?.id ?? null) : prev));
    },
    [fixedEntries],
  );

  /* Las pegadas nacen sin nombre: al añadirlas solo hay un link. Cuando Spotify
     contesta se le pone el suyo, y el efecto de persistencia lo guarda para que
     la proxima visita ya lo tenga sin esperar a que carguen. */
  useEffect(() => {
    if (!data?.id || !data.name) return;
    setCustomEntries((prev) =>
      prev.some((entry) => entry.id === data.id && entry.label !== data.name)
        ? prev.map((entry) => (entry.id === data.id ? { ...entry, label: data.name } : entry))
        : prev,
    );
  }, [data]);

  /* ---------- Render ---------- */

  // El fondo lo manda la cancion que suena, no el raton.
  /* El fondo se alimenta de la portada MEDIANA (300 px), no de la miniatura de
     64. Con 64 px no hay material: estirados a pantalla completa cada pixel del
     original mide ~46 px en un movil, y ningun desenfoque razonable disimula
     bloques de ese tamaño. La mediana ya se descarga igualmente para la fila
     que suena, asi que no es peso nuevo. */
  const backdropSource =
    currentTrack?.art?.md || currentTrack?.art?.lg || currentTrack?.art?.sm || data?.image || null;
  const playableCount = tracks.reduce((n, _, index) => n + (isPlayable(index) ? 1 : 0), 0);

  // El <h1> salio de pantalla y su titulo pasa a la barra superior.
  const stuckTitle = Boolean(titleStuck && data);

  /* Lo que queda fuera, contra el total REAL de Spotify. Suma las dos podas: la
     del server (200) y la de las pegadas (49). `totalCount` ya viajaba en la
     respuesta desde siempre y hasta ahora no lo miraba nadie. */
  const hiddenCount = Math.max(0, (data?.totalCount ?? 0) - Math.min(tracks.length, trackLimit));

  const viewProps = {
    items: visible,
    focusedIndex,
    playingIndex,
    selectedIndex,
    isPlayable,
    isPending,
    isPlaying: player.isPlaying,
    subscribePosition: player.subscribePosition,
    duration: player.duration,
    register,
    onSelect: handleSelect,
    onHover: handleHover,
    onSeek: seek,
    onPointerDown,
  };

  return (
    <>
      {showSplash ? <Splash onDone={dismissSplash} /> : null}

      <Backdrop src={backdropSource} playing={player.isPlaying} />

      <div className="shell">
        {/* `topbar--stuck` lo necesita el CSS para retirar la marca en movil,
            donde el titulo de la playlist ocupa su mismo sitio. */}
        <header className={`topbar${stuckTitle ? ' topbar--stuck' : ''}`}>
          <span className="wordmark">
            <b>Manu A.</b> Martínez
          </span>

          <button
            type="button"
            className={`topbar__title${stuckTitle ? ' topbar__title--on' : ''}`}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            tabIndex={stuckTitle ? 0 : -1}
            aria-hidden={stuckTitle ? undefined : 'true'}
          >
            {data?.name}
          </button>

          <div className="topbar__right">
            <PlaylistMenu
              entries={entries}
              activeId={currentId}
              onSelect={(entry) => setCurrentId(entry.id)}
              adding={adding}
              setAdding={setAdding}
              onSubmit={handleAddPlaylist}
              onRemove={handleRemovePlaylist}
              /* Solo con la playlist ya en pantalla y el splash fuera: durante
                 el saludo no se ve la barra, y el aviso se gastaria a solas. */
              hint={Boolean(data) && !showSplash}
            />
            {data ? <ViewToggle view={view} onChange={setView} /> : null}
          </div>
        </header>

        <main>
          {loading ? <LoadingList /> : null}

          {!loading && error ? (
            <ErrorState message={error} onRetry={currentId ? () => setCurrentId(currentId) : null} />
          ) : null}

          {!loading && !error && !currentId ? <EmptyState onAdd={() => setAdding(true)} /> : null}

          {!loading && !error && data ? (
            <>
              <div className="intro">
                <p className="intro__eyebrow">Playlist{data.owner ? ` de ${data.owner}` : ''}</p>

                <div className="intro__head">
                  <h1 className="intro__title">{data.name}</h1>

                  <button
                    type="button"
                    className="shuffle"
                    onClick={handleRandom}
                    disabled={!playableCount}
                    aria-label="Reproducir una canción al azar"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 7h4l3.5 5L7 17H3M21 7h-4l-7 10H3" />
                      <path d="M18 4l3 3-3 3M18 14l3 3-3 3" />
                    </svg>
                    <span>Al azar</span>
                  </button>
                </div>

                <p className="intro__meta">
                  {data.trackCount} canciones &middot; {playableCount} con preview
                  {data.description ? ` — ${data.description}` : ''}
                </p>
              </div>

              <Toolbar
                query={query}
                onQuery={setQuery}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                count={visible.length}
                /* Lo que se puede llegar a ver, no lo que se tiene cargado: en
                   una pegada decir "3 de 200" cuando el maximo son 49 miente. */
                total={Math.min(tracks.length, trackLimit)}
              />

              {/* Centinela: cuando pasa por encima del viewport, el titulo
                  aparece en la barra superior. */}
              <div ref={sentinelRef} className="sentinel" aria-hidden="true" />

              {visible.length === 0 ? (
                <NoMatches query={query} onClear={() => setQuery('')} />
              ) : (
                <>
                  {view === 'grid' ? <TrackGrid {...viewProps} /> : <TrackList {...viewProps} />}
                  {/* Con una busqueda puesta no sale: lo que falta ahi es
                      "resultados", y mezclarlo con el total de la playlist solo
                      confunde. */}
                  {query ? null : <MoreOnSpotify count={hiddenCount} url={data.externalUrl} />}
                </>
              )}

              <Footer
                playlistUrl={data.externalUrl}
                onRandom={handleRandom}
                canShuffle={playableCount > 0}
              />
            </>
          ) : null}
        </main>

        {/* No hace falta excluirlo cuando esta el mini: el hint desaparece con
            `touched`, que se pone al reproducir, y el mini solo existe si algo
            suena. Nunca coinciden. */}
        {data && !touched ? (
          <p className="hint">Click para reproducir &middot; arrastra o usa las flechas</p>
        ) : null}
      </div>

      <MiniPlayer
        track={currentTrack}
        isPlaying={player.isPlaying}
        duration={player.duration}
        subscribePosition={player.subscribePosition}
        shown={Boolean(currentTrack) && !activeRowVisible}
        onToggle={toggle}
        onSeek={seek}
        onPrev={() => skip(-1)}
        onNext={() => skip(1)}
        onFocusRow={() => scrollTo(playingIndex)}
      />
    </>
  );
}
