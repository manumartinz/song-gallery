import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Backdrop from './components/Backdrop.jsx';
import Cover from './components/Cover.jsx';
import EndCard from './components/EndCard.jsx';
import Footer from './components/Footer.jsx';
import MiniPlayer from './components/MiniPlayer.jsx';
import PlayGlyph from './components/PlayGlyph.jsx';
import Quiz from './components/Quiz.jsx';
import PlaylistMenu from './components/PlaylistMenu.jsx';
import Splash from './components/Splash.jsx';
import TrackGrid from './components/TrackGrid.jsx';
import TrackList from './components/TrackList.jsx';
import MoreOnSpotify from './components/MoreOnSpotify.jsx';
import NowListening, { useNowListening } from './components/NowListening.jsx';
import NowPlaying from './components/NowPlaying.jsx';
import ShortcutsPanel from './components/ShortcutsPanel.jsx';
import SourceRail from './components/SourceRail.jsx';
import Toast from './components/Toast.jsx';
import Toolbar from './components/Toolbar.jsx';
import ViewToggle from './components/ViewToggle.jsx';
import VolumeControl from './components/VolumeControl.jsx';
import { EmptyState, ErrorState, LoadingList, NoMatches } from './components/States.jsx';
import { dropPlaylistCache, parsePlaylistRef } from './lib/api.js';
import { tag, trackEvent } from './lib/clarity.js';
import isHardReload from './lib/hardReload.js';
import { facetOptions, hasFacets, makeFacetFilter, NO_FACETS } from './lib/facets.js';
import { makeFilter, SORTS } from './lib/search.js';
import { shareLink, shareStory, trackUrl } from './lib/share.js';
import {
  ALBUM_ENTRIES,
  CUSTOM_TRACKS,
  DEFAULT_SORTS,
  FIXED_ENTRIES,
  MAX_CUSTOM,
  persistCustom,
  readCustomEntries,
  readInitialSource,
} from './lib/sources.js';
import useAccentColor from './hooks/useAccentColor.js';
import useDragScroll from './hooks/useDragScroll.js';
import useHeard from './hooks/useHeard.js';
import useKeyboard from './hooks/useKeyboard.js';
import useMediaSession from './hooks/useMediaSession.js';
import usePlaybackFailures from './hooks/usePlaybackFailures.js';
import usePlayer from './hooks/usePlayer.js';
import useReactions from './hooks/useReactions.js';
import useReducedMotion from './hooks/useReducedMotion.js';
import useRowRegistry from './hooks/useRowRegistry.js';
import useSourceData from './hooks/useSourceData.js';
import useSticky from './hooks/useSticky.js';
import useToast from './hooks/useToast.js';
import useUrlSync from './hooks/useUrlSync.js';

const VIEW_KEY = 'song-gallery:view';
const INTRO_KEY = 'song-gallery:intro-seen'; // lo escribe Splash; aqui solo se consulta
const HEARD_AFTER_MS = 10_000;
const RADIO_HOP = 4; // canciones de cada fuente antes de que la radio salte a otra

/** Una tecla sola, sin modificadores: los atajos del navegador van por delante. */
function bare(event) {
  return !event.metaKey && !event.ctrlKey && !event.altKey;
}

/* Criterios que un album no puede ofrecer. Fuera del componente para que sea
   siempre el mismo array y no rompa el memo de la barra de herramientas. */
const SORTS_OFF_ALBUM = ['added'];

export default function App() {
  const reducedMotion = useReducedMotion();

  const fixedEntries = FIXED_ENTRIES;
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

  /* La fuente inicial sale de la URL (?p= playlist, ?a= album) para que la
     vista sea compartible. */
  const [current, setCurrent] = useState(() => readInitialSource());
  /* El resto del componente trabaja con el id pelado, como toda la vida. Sólo
     la carga, la URL y la cabecera necesitan saber además de qué tipo es. */
  const currentId = current.id;
  const currentKind = current.kind;
  const isAlbum = currentKind === 'album';

  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  });

  /* Saludo de bienvenida: una sola vez por navegador. Vuelve a salir con
     `?intro` o con una recarga forzada (Ctrl+Shift+R), el mismo gesto con el
     que reaparece el aviso del nav: quien quiere volver a ver como recibe la
     pagina hace eso, no borra claves en DevTools.

     Aqui se pregunta en el inicializador, o sea en el primer render, cuando de
     lo propio solo han cargado el bundle y la hoja de estilos. Basta: los dos
     pesan de sobra para el filtro y en una recarga forzada ambos viajan
     enteros. */
  const [showSplash, setShowSplash] = useState(() => {
    if (new URLSearchParams(location.search).has('intro')) return true;
    if (isHardReload()) return true;
    try {
      return !localStorage.getItem(INTRO_KEY);
    } catch {
      return true; // sin almacenamiento gana la intencion de dar la bienvenida
    }
  });
  // Estable a proposito: Splash lo usa como dependencia de su temporizador.
  const dismissSplash = useCallback(() => setShowSplash(false), []);

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
  /* Claves ya reintentadas tras un fallo. Es por fuente: la vacia la carga. */
  const retriedKeys = useRef(new Set());

  /* Pista que se ha clicado antes de que su preview estuviese resuelto: se
     reproduce sola en cuanto llega. -1 = nada esperando. */
  const [playWhenReady, setPlayWhenReady] = useState(-1);

  // La fuente sono entera y no hay siguiente: sale el aviso de fin.
  const [ended, setEnded] = useState(false);

  const [query, setQuery] = useState('');
  const [facets, setFacets] = useState(NO_FACETS);
  const [sortBy, setSortBy] = useState('original');
  const [sortDir, setSortDir] = useState(1);

  /* Cuantas canciones se enseñan de la fuente que se esta viendo. Las del repo
     —playlists fijas y albumes— todas; las playlists pegadas, hasta
     CUSTOM_TRACKS. Un album del repo nunca se recorta: es una recomendacion, y
     media recomendacion no es ninguna. */
  const trackLimit = useMemo(
    () =>
      !isAlbum && entries.find((entry) => entry.id === currentId)?.custom
        ? CUSTOM_TRACKS
        : Infinity,
    [entries, currentId, isAlbum],
  );

  // Fin de tema -> avanza. Va por ref porque `skip` se define mas abajo.
  const endedRef = useRef(null);
  const player = usePlayer({
    crossfade: !reducedMotion,
    onEnded: () => endedRef.current?.(),
  });

  const { play, toggle, seek, stop, preload, getPosition } = player;
  /* El juego usa el mismo motor. Mientras esta abierto la lista no avanza sola
     ni atiende al teclado. */
  const [quizOpen, setQuizOpen] = useState(() => new URLSearchParams(location.search).has('juego'));
  const { setVolume, nudgeVolume, toggleMute } = player;

  /* ---------- Carga de la fuente (playlist o album) ---------- */

  /* Fuente nueva, todo lo que pertenecia a la anterior en blanco. Los criterios
     de orden tambien: mantenerlos confundiria mas que ayudar. "En blanco" es el
     orden que declare la config, y `original` para las que no declaren
     ninguno —que es el caso de todos los albumes, donde `original` significa
     el orden del disco. */
  const resetForSource = useCallback(
    (source) => {
      stop();
      setPlayingIndex(-1);
      setSelectedIndex(-1);
      setUnplayable(new Set());
      retriedKeys.current = new Set();
      setHoverIndex(null);
      setKeyIndex(0);
      setQuery('');
      setFacets(NO_FACETS);
      setEnded(false);
      const initialSort = DEFAULT_SORTS.get(source.id) ?? 'original';
      setSortBy(initialSort);
      setSortDir(SORTS[initialSort].dir);
    },
    [stop],
  );

  const { data, loading, error, retry, resolveNow, expirePreview } = useSourceData({
    kind: currentKind,
    id: currentId,
    trackLimit,
    onReset: resetForSource,
  });

  const tracks = useMemo(() => data?.tracks ?? [], [data]);
  const focusedIndex = hoverIndex ?? keyIndex;
  const currentTrack = tracks[playingIndex] || null;

  /* Lo que se ve, ya filtrado y ordenado. Cada entrada conserva su indice
     ORIGINAL: esa es la identidad con la que trabaja todo el estado (que suena,
     que esta abierta, cuales fallaron, el mapa de nodos). Si el estado fuese por
     posicion visible, filtrar u ordenar lo descuadraria todo de golpe. */
  const [heard, markHeard] = useHeard();

  const visible = useMemo(() => {
    const filter = makeFilter(query);
    // Las escuchadas van en la foto que guarda el chip, no en vivo: ver facets.js.
    const facetFilter = makeFacetFilter(facets);
    let items = tracks.map((track, index) => ({ track, index }));

    if (filter) items = items.filter((item) => filter(item.track));
    if (facetFilter) items = items.filter((item) => facetFilter(item.track));

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
  }, [tracks, query, facets, sortBy, sortDir, trackLimit]);

  const { register, scrollTo, getNode } = useRowRegistry();
  const { onPointerDown, wasDragged } = useDragScroll({ enabled: !reducedMotion });
  const [sentinelRef, titleStuck] = useSticky();

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
      play(track, index);
      scrollTo(index);
    },
    [tracks, isPlayable, play, scrollTo],
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

  const skip = useCallback(
    (step) => {
      const next = findPlayable(playingIndex, step);
      if (next !== -1) startTrack(next);
    },
    [findPlayable, playingIndex, startTrack],
  );

  /* Calienta la cache con el tema siguiente para que el avance automatico
     entre sin hueco. Va por un elemento aparte, no por los decks. */
  useEffect(() => {
    if (playingIndex === -1) return;
    const next = findPlayable(playingIndex, 1);
    if (next !== -1) preload(tracks[next]?.previewUrl);
  }, [playingIndex, findPlayable, tracks, preload]);

  /* ---------- Escuchadas ---------- */

  /* Cuenta como escuchada a los diez segundos de sonar, no al darle al play:
     saltar de una en una buscando algo no es haberlas escuchado. Pausar
     reinicia la cuenta, que es lo honesto con un fragmento de treinta. */
  const playingId = currentTrack?.id ?? null;

  useEffect(() => {
    if (!playingId || !player.isPlaying) return undefined;
    const timer = setTimeout(() => markHeard(playingId), HEARD_AFTER_MS);
    return () => clearTimeout(timer);
  }, [playingId, player.isPlaying, markHeard]);

  const facetChoices = useMemo(() => facetOptions(tracks), [tracks]);

  /* Encender "sin escuchar" guarda una foto de las escuchadas en ese momento:
     lo que se marque despues no saca canciones de la lista mientras se oye. */
  const handleFacets = useCallback(
    (change) => {
      trackEvent('facet');
      setFacets((prev) => {
        const next = { ...prev, ...change };
        if ('unheard' in change) next.unheard = change.unheard ? new Set(heard) : false;
        return next;
      });
    },
    [heard],
  );

  const heardCount = useMemo(
    () => tracks.reduce((n, track) => n + (heard.has(track.id) ? 1 : 0), 0),
    [tracks, heard],
  );

  /* ---------- URL ---------- */

  /* Cancion pedida por ?t= al entrar: se abre la ficha y se centra, pero NO se
     reproduce. No es una decision estetica: el navegador bloquea el audio sin
     un gesto previo, play() rechazaria con NotAllowedError, y usePlayer solo
     perdona AbortError -- el resto marca la pista como muerta y salta a la
     siguiente. Un enlace compartido se autodestruiria nada mas abrirlo. La fila
     ya muestra su triangulo de play, que es invitacion suficiente. */
  const openDeepLink = useCallback(
    (index) => {
      setSelectedIndex(index);
      setKeyIndex(index);
      scrollTo(index, 'instant');
    },
    [scrollTo],
  );

  useUrlSync({
    id: currentId,
    isAlbum,
    trackId: currentTrack?.id ?? null,
    tracks,
    onDeepLink: openDeepLink,
  });

  useEffect(() => {
    tag('view', view);
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
    /* `view` y `visible` estan aqui porque el NODO cambia con ellos:
       conmutar lista/cuadricula o filtrar remonta las filas y deja al observer
       mirando un elemento que ya no esta en el documento. */
  }, [playingIndex, getNode, view, visible]);

  /* ---------- Acento cromatico: lo manda la cancion que suena ---------- */

  /* En una playlist cada cancion trae su portada y el color cambia al sonar.
     Un album tiene una sola, asi que no hace falta esperar a darle al play: el
     color es el del disco desde que se abre. */
  useAccentColor(
    currentTrack?.art?.sm ||
      currentTrack?.art?.lg ||
      (isAlbum ? data?.art?.sm || data?.image : null) ||
      null,
  );

  /* ---------- Metadatos para los controles del sistema ---------- */

  /* Play y pausa van por separado y no a un toggle: el sistema dice lo que
     quiere, y si ya esta asi no hay que darle la vuelta. */
  useMediaSession({
    track: currentTrack,
    isPlaying: player.isPlaying,
    duration: player.duration,
    getPosition,
    onPlay: () => {
      if (!player.isPlaying) toggle();
    },
    onPause: () => {
      if (player.isPlaying) toggle();
    },
    onPrev: () => skip(-1),
    onNext: () => skip(1),
    onSeek: seek,
  });

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
        trackEvent('play_unavailable');
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
      trackEvent('play');
      startTrack(index);
    },
    [wasDragged, tracks, playingIndex, toggle, startTrack, isPending, isPlayable, resolveNow],
  );

  const handleHover = useCallback((index) => setHoverIndex(index), []);

  const [toast, notify] = useToast();
  const listening = useNowListening();

  // Reacciones de las canciones abiertas. Apagadas si el servidor no tiene Redis.
  const trackIds = useMemo(() => tracks.map((track) => track.id), [tracks]);
  const reactions = useReactions(trackIds);

  /** Comparte el enlace a una cancion de la fuente abierta. */
  /* Historia para Instagram. La imagen se dibuja en el servidor y tarda un
     par de segundos: se avisa antes para que el toque no parezca perdido. */
  const handleStory = useCallback(
    async (index) => {
      const track = tracks[index];
      if (!track) return;
      trackEvent('story');
      notify('Preparando la imagen…');
      const result = await shareStory({ kind: currentKind, id: currentId }, track);
      if (result === 'downloaded') notify('Imagen descargada: subila a tu historia');
      else if (result === 'failed') notify('No se pudo preparar la imagen');
      else if (result === 'retry') notify('Imagen lista: tocá de nuevo para compartirla');
    },
    [tracks, currentKind, currentId, notify],
  );

  const handleShare = useCallback(
    async (index) => {
      const track = tracks[index];
      if (!track) return;
      trackEvent('share');
      const result = await shareLink({
        title: `${track.title} — ${track.artistLine}`,
        text: `${track.title}, de ${track.artistLine}`,
        url: trackUrl({ kind: currentKind, id: currentId }, track.id),
      });
      if (result === 'copied') notify('Link copiado');
      else if (result === 'failed') notify('No se pudo copiar el link');
    },
    [tracks, currentKind, currentId, notify],
  );

  /* Cada criterio entra con el sentido que uno espera: los años y las ultimas
     añadidas de mas reciente a mas antiguo, el artista alfabetico. Volver a
     pulsar el criterio activo invierte el sentido. */
  const handleSort = useCallback(
    (key) => {
      trackEvent(`sort_${key}`);
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
    trackEvent('random');
    startTrack(pool[Math.floor(Math.random() * pool.length)]);
  }, [visible, isPlayable, playingIndex, startTrack]);

  /* El boton principal de la cabecera. Con algo sonando pausa y reanuda; sin
     nada, arranca por la primera que se pueda oir en el orden que se ve, que
     es lo que uno espera de un "reproducir" delante de una lista. */
  const handlePlayAll = useCallback(() => {
    setTouched(true);
    if (playingIndex !== -1) {
      toggle();
      return;
    }
    const first = findPlayable(-1, 1);
    if (first === -1) return;
    trackEvent('play_all');
    startTrack(first);
  }, [playingIndex, toggle, findPlayable, startTrack]);

  /* ---------- Juego ---------- */

  const openQuiz = useCallback(() => {
    trackEvent('quiz_open');
    stop();
    setPlayingIndex(-1);
    setRadio(false);
    setQuizOpen(true);
  }, [stop]);

  const closeQuiz = useCallback(() => {
    setQuizOpen(false);
    // Salir del juego no deja un ?juego colgando que lo reabra al recargar.
    const url = new URL(location.href);
    if (url.searchParams.has('juego')) {
      url.searchParams.delete('juego');
      history.replaceState(null, '', url);
    }
  }, []);

  /* Lo que entra en el juego: lo que se ve y se puede oir. Vivo a proposito:
     con un enlace ?juego el juego abre antes de que lleguen los previews, y las
     rondas se arman al empezar, con lo que haya entonces. */
  const quizPool = useMemo(
    () => visible.filter((item) => isPlayable(item.index)).map((item) => item.track),
    [visible, isPlayable],
  );

  const shareQuizResult = useCallback(
    async (score, total) => {
      trackEvent('quiz_share');
      const url = new URL(location.origin);
      url.searchParams.set(isAlbum ? 'a' : 'p', currentId);
      url.searchParams.set('juego', '');
      const text = `Reconocí ${score} de ${total} canciones de «${data?.name}». ¿Cuántas reconocés vos?`;
      const link = url.toString().replace('juego=', 'juego');
      const result = await shareLink({
        title: 'Adiviná la canción',
        text,
        url: link,
        copyText: `${text} ${link}`,
      });
      if (result === 'copied') notify('Resultado copiado');
    },
    [isAlbum, currentId, data?.name, notify],
  );

  /* ---------- Fin de la fuente y radio ---------- */

  /* Todo lo que se puede abrir desde la web, en el orden del menu: primero las
     playlists del repo, luego los albumes. Las pegadas no entran: son del
     visitante, y la radio es mi seleccion. */
  const allSources = useMemo(
    () => [
      ...fixedEntries.map((entry) => ({ kind: 'playlist', id: entry.id, label: entry.label })),
      ...ALBUM_ENTRIES.map((album) => ({ kind: 'album', id: album.id, label: album.label })),
    ],
    [fixedEntries],
  );

  // La que viene despues de la abierta, dando la vuelta al final.
  const nextSource = useMemo(() => {
    if (allSources.length < 2) return null;
    const at = allSources.findIndex((s) => s.kind === currentKind && s.id === currentId);
    return allSources[(at + 1) % allSources.length];
  }, [allSources, currentKind, currentId]);

  const [radio, setRadio] = useState(false);
  /* Arranque pendiente tras cambiar de fuente: 'first' o 'random'. Se cumple
     en cuanto la fuente nueva tenga algo que sonar. */
  const [autoplay, setAutoplay] = useState(null);
  const radioPlays = useRef(0);

  /** Abre otra fuente y la deja sonando. */
  const hopTo = useCallback((source, mode) => {
    setEnded(false);
    setAutoplay(mode);
    setCurrent({ kind: source.kind, id: source.id });
  }, []);

  useEffect(() => {
    if (!autoplay || !data || data.id !== currentId) return;

    if (autoplay === 'first') {
      /* La primera en el orden que se ve. Si esta aun sin resolver se espera
         a que llegue su tramo: saltarla seria empezar por la segunda. */
      for (const { index } of visible) {
        if (isPending(index)) return;
        if (isPlayable(index)) {
          setAutoplay(null);
          startTrack(index);
          return;
        }
      }
      setAutoplay(null);
      return;
    }

    const candidates = visible.map((item) => item.index).filter(isPlayable);
    if (candidates.length) {
      setAutoplay(null);
      startTrack(candidates[Math.floor(Math.random() * candidates.length)]);
    } else if (!tracks.some((track) => track.previewUrl === undefined)) {
      setAutoplay(null); // todo resuelto y nada suena: se desiste
    }
  }, [autoplay, data, currentId, visible, isPending, isPlayable, startTrack, tracks]);

  /* La radio salta de fuente cada RADIO_HOP canciones y no en cada una: cada
     salto carga una fuente entera y sus previews, y el limite por IP se
     agotaria en pocos minutos. Entre salto y salto sortea dentro de la
     abierta. */
  const radioNext = useCallback(() => {
    radioPlays.current += 1;
    const others = allSources.filter((s) => !(s.kind === currentKind && s.id === currentId));
    if (others.length && radioPlays.current % RADIO_HOP === 0) {
      hopTo(others[Math.floor(Math.random() * others.length)], 'random');
      return;
    }
    handleRandom();
  }, [allSources, currentKind, currentId, hopTo, handleRandom]);

  const toggleRadio = useCallback(() => {
    setRadio((on) => {
      trackEvent(on ? 'radio_off' : 'radio_on');
      return !on;
    });
    setEnded(false);
    radioPlays.current = 0;
    // Encenderla sin nada sonando es pedir que suene algo ya.
    if (!radio && !player.isPlaying) handleRandom();
  }, [radio, player.isPlaying, handleRandom]);

  endedRef.current = () => {
    if (quizOpen) return;
    if (radio) {
      radioNext();
      return;
    }
    const next = findPlayable(playingIndex, 1);
    if (next !== -1) startTrack(next);
    else setEnded(true);
  };

  // Cualquier cosa que vuelva a sonar retira el aviso de fin.
  useEffect(() => {
    if (player.isPlaying) setEnded(false);
  }, [player.isPlaying]);

  usePlaybackFailures({
    player,
    retriedKeys,
    findPlayable,
    startTrack,
    expirePreview,
    resolveNow,
    setUnplayable,
    setPlayingIndex,
    setPlayWhenReady,
  });

  const [showKeys, setShowKeys] = useState(false);
  const [nowOpen, setNowOpen] = useState(false);
  const closeNow = useCallback(() => setNowOpen(false), []);
  const openNow = useCallback(() => {
    trackEvent('now_open');
    setNowOpen(true);
  }, []);

  // Sin nada sonando no hay "ahora suena" que enseñar.
  useEffect(() => {
    if (!currentTrack) setNowOpen(false);
  }, [currentTrack]);
  const closeKeys = useCallback(() => setShowKeys(false), []);

  useKeyboard((event) => {
    // No robar teclas mientras se escribe o se ajusta la barra.
    if (event.target.closest?.('input, textarea, [role="slider"]')) return;
    // Con un modal abierto, el teclado es suyo.
    if (document.body.classList.contains('is-modal')) return;

    /* `?` abre y cierra la ayuda. Con ella abierta no se mueve nada por
       debajo: el foco esta en el panel y lo que se pulse es para el. */
    if (event.key === '?') {
      event.preventDefault();
      setShowKeys((open) => !open);
      return;
    }
    if (quizOpen) return;
    if (showKeys || nowOpen) {
      /* Con la vista grande abierta siguen valiendo los gestos de reproduccion;
         moverse por una lista que no se ve, no. */
      if (!nowOpen) return;
      if (event.key === ' ') {
        event.preventDefault();
        toggle();
      } else if (bare(event) && event.key === 'n') skip(1);
      else if (bare(event) && event.key === 'p') skip(-1);
      else if (bare(event) && event.key === 'f') setNowOpen(false);
      return;
    }

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
      /* Volumen con las teclas de siempre. Las flechas arriba y abajo ya son
         del cursor de la lista, asi que aqui van los signos. Con modificador
         no: Cmd+M minimiza la ventana y Ctrl+- es el zoom del navegador, y
         robarles el gesto seria silenciar la pagina sin querer. */
      case '+':
      case '=':
        if (!bare(event)) break;
        nudgeVolume(0.1);
        break;
      case '-':
        if (!bare(event)) break;
        nudgeVolume(-0.1);
        break;
      case 'm':
        if (!bare(event)) break;
        toggleMute();
        break;
      case 'n':
        if (!bare(event)) break;
        skip(1);
        break;
      case 'p':
        if (!bare(event)) break;
        skip(-1);
        break;
      case 's':
        if (!bare(event)) break;
        handleRandom();
        break;
      case 'r':
        if (!bare(event)) break;
        toggleRadio();
        break;
      case 'f':
        if (!bare(event) || !currentTrack) break;
        setNowOpen(true);
        break;
      case 'g':
        if (!bare(event)) break;
        openQuiz();
        break;
      default:
        break;
    }
  });

  /* Cambiar de fuente. Dos funciones y no una con un parametro: quien las llama
     sabe siempre cual de las dos cosas esta abriendo, y un id pelado no permite
     distinguirlo despues. */
  const selectPlaylist = useCallback((id) => {
    trackEvent('source_change');
    setCurrent({ kind: 'playlist', id });
  }, []);
  const selectAlbum = useCallback((id) => {
    trackEvent('source_change');
    setCurrent({ kind: 'album', id });
  }, []);

  /* La etiqueta va atada a `current` y no a los clicks: asi tambien la reciben
     la fuente de un enlace compartido y la que queda al quitar una pegada. */
  useEffect(() => {
    if (current?.id) tag('source', `${current.kind}:${current.id}`);
  }, [current]);

  /**
   * Devuelve el motivo del rechazo, o null si la playlist entro.
   *
   * Devolver el mensaje en vez de mostrar un error de pagina es a proposito:
   * ErrorState cambia la pagina entera, asi que avisar de un link mal pegado
   * borraba de la pantalla la playlist que se estuviera escuchando. El menu
   * pinta esto junto al campo, donde se ha cometido el error.
   */
  const handleAddPlaylist = useCallback(
    (value) => {
      const id = parsePlaylistRef(value);
      if (!id) {
        trackEvent('playlist_rejected');
        return 'Ese link no parece una playlist de Spotify.';
      }

      /* Si es una de las de la casa se va a ella y no se guarda nada. Sin esto
         ocupaba un hueco del tope: `entries` deduplica, asi que la copia no
         llegaba a salir en el menu y no habia aspa con la que recuperarlo. */
      if (fixedEntries.some((entry) => entry.id === id)) {
        selectPlaylist(id);
        return null;
      }

      const known = customEntries.some((entry) => entry.id === id);
      if (!known && customEntries.length >= MAX_CUSTOM) {
        trackEvent('playlist_rejected');
        return `Solo caben ${MAX_CUSTOM} playlists pegadas. Quitá una para añadir otra.`;
      }

      // Repetir una que ya esta no es un error: se va a ella y ya.
      if (!known) {
        trackEvent('playlist_added');
        setCustomEntries((prev) => [...prev, { id, label: null, ref: id, custom: true }]);
      }
      selectPlaylist(id);
      return null;
    },
    [customEntries, fixedEntries, selectPlaylist],
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
      trackEvent('playlist_removed');
      setCustomEntries((prev) => prev.filter((entry) => entry.id !== id));
      dropPlaylistCache(id);
      /* Si era la que se estaba viendo hay que ir a alguna parte: la primera.
         Sólo puede estar viéndose si la fuente es una playlist, así que un
         álbum abierto no se entera de que han borrado una lista de al lado. */
      setCurrent((prev) =>
        prev.kind === 'playlist' && prev.id === id
          ? { kind: 'playlist', id: fixedEntries[0]?.id ?? null }
          : prev,
      );
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

  /* Con una busqueda puesta no se ofrece: lo que falta ahi son resultados del
     filtro, y contarlos contra el total de la playlist confunde mas que ayuda. */
  const moreCount = query || hasFacets(facets) ? 0 : hiddenCount;

  const viewProps = {
    items: visible,
    album: isAlbum,
    focusedIndex,
    playingIndex,
    selectedIndex,
    isPlayable,
    isPending,
    heard,
    isPlaying: player.isPlaying,
    subscribePosition: player.subscribePosition,
    duration: player.duration,
    register,
    onSelect: handleSelect,
    onHover: handleHover,
    onSeek: seek,
    onShare: handleShare,
    onStory: handleStory,
    reactions: reactions.enabled ? reactions : null,
    onExpand: openNow,
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
          {/* El apellido va en su propio span para poder retirarlo solo a el en
              pantallas estrechas: ahi la barra no da para la firma entera y los
              cuatro controles, y "Manu A." sigue siendo una firma. */}
          <span className="wordmark">
            <b>Manu A.</b> <span className="wordmark__last">Martínez</span>
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
              /* Con un album abierto no hay pestaña encendida, y esta bien asi:
                 ninguna de esas playlists es lo que se esta escuchando. */
              activeId={isAlbum ? null : currentId}
              onSelect={(entry) => selectPlaylist(entry.id)}
              /* Sólo pinta algo en móvil, donde el desplegable lleva las dos
                 listas; en ancho las dos van en el riel de la izquierda. */
              albums={ALBUM_ENTRIES}
              activeAlbumId={isAlbum ? currentId : null}
              onSelectAlbum={selectAlbum}
              adding={adding}
              setAdding={setAdding}
              onSubmit={handleAddPlaylist}
              onRemove={handleRemovePlaylist}
              /* Solo con la playlist ya en pantalla y el splash fuera: durante
                 el saludo no se ve la barra, y el aviso se gastaria a solas. */
              hint={Boolean(data) && !showSplash}
            />
            {data ? (
              <>
                <VolumeControl
                  volume={player.volume}
                  muted={player.muted}
                  onVolume={setVolume}
                  onToggleMute={toggleMute}
                />
                <ViewToggle view={view} onChange={setView} />
              </>
            ) : null}
          </div>
        </header>

        <SourceRail
          entries={entries}
          activePlaylistId={isAlbum ? null : currentId}
          onSelectPlaylist={selectPlaylist}
          onRemove={handleRemovePlaylist}
          albums={ALBUM_ENTRIES}
          activeAlbumId={isAlbum ? currentId : null}
          onSelectAlbum={selectAlbum}
          activeKind={currentKind}
          adding={adding}
          setAdding={setAdding}
          onSubmit={handleAddPlaylist}
          /* Mismo permiso que le damos al menú de arriba: sólo con la fuente ya
             en pantalla y el saludo fuera. */
          hint={Boolean(data) && !showSplash}
        />

        <main>
          {loading ? <LoadingList /> : null}

          {!loading && error ? (
            <ErrorState message={error} onRetry={currentId ? retry : null} />
          ) : null}

          {!loading && !error && !currentId ? <EmptyState onAdd={() => setAdding(true)} /> : null}

          {!loading && !error && data ? (
            <>
              <div className={`intro${isAlbum && data.art?.lg ? ' intro--art' : ''}`}>
                {/* Solo en un álbum: la portada es la del disco entero y sale una
                    vez, arriba. En una playlist cada fila lleva la suya y ahí no
                    hay una sola imagen que valga por todas. */}
                {isAlbum && data.art?.lg ? (
                  <div className="intro__art">
                    <Cover art={data.art} sizes="(max-width: 720px) 40vw, 200px" />
                  </div>
                ) : null}

                <div className="intro__text">
                  <p className="intro__eyebrow">
                    {isAlbum ? 'Álbum' : 'Playlist'}
                    {data.owner ? ` de ${data.owner}` : ''}
                  </p>

                  <div className="intro__head">
                    <h1 className="intro__title">{data.name}</h1>

                    <div className="intro__actions">
                      <button
                        type="button"
                        className="play-all"
                        onClick={handlePlayAll}
                        disabled={!playableCount}
                      >
                        <PlayGlyph playing={player.isPlaying} />
                        <span>
                          {player.isPlaying
                            ? 'Pausar'
                            : playingIndex !== -1
                              ? 'Seguir'
                              : 'Reproducir'}
                        </span>
                      </button>

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
                  </div>

                  <p className="intro__meta">
                    {data.trackCount} canciones &middot; {playableCount} con preview
                    {/* Solo cuando ya hay algo: "0 escuchadas" a quien acaba de
                        llegar suena a reproche. */}
                    {heardCount
                      ? ` · ${heardCount} ${heardCount === 1 ? 'escuchada' : 'escuchadas'}`
                      : ''}
                    {/* Un album no trae descripcion, pero si año y sello, que es
                        lo que uno mira de un disco. */}
                    {isAlbum && data.year ? ` · ${data.year}` : ''}
                    {isAlbum && data.label ? ` · ${data.label}` : ''}
                    {data.description ? ` — ${data.description}` : ''}
                  </p>

                  <NowListening now={listening} />
                </div>
              </div>

              <Toolbar
                query={query}
                onQuery={setQuery}
                filtering={Boolean(query) || hasFacets(facets)}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                count={visible.length}
                /* Lo que se puede llegar a ver, no lo que se tiene cargado: en
                   una pegada decir "3 de 200" cuando el maximo son 49 miente. */
                total={Math.min(tracks.length, trackLimit)}
                omit={isAlbum ? SORTS_OFF_ALBUM : undefined}
                facetChoices={facetChoices}
                facets={facets}
                onFacets={handleFacets}
                /* Sin escuchadas no hay nada que separar. */
                canFilterUnheard={heardCount > 0}
              />

              {/* Centinela: cuando pasa por encima del viewport, el titulo
                  aparece en la barra superior. */}
              <div ref={sentinelRef} className="sentinel" aria-hidden="true" />

              {visible.length === 0 ? (
                <NoMatches
                  query={query}
                  filtered={hasFacets(facets)}
                  onClear={() => {
                    setQuery('');
                    setFacets(NO_FACETS);
                  }}
                />
              ) : view === 'grid' ? (
                /* En la cuadricula la salida entra DENTRO de la reticula, como
                   una casilla mas: una barra suelta bajo un mosaico no se lee
                   como parte de el.

                   En un album todas las canciones comparten portada, asi que en
                   vez de repetirla trece veces se reparte por la reticula. */
                <TrackGrid
                  {...viewProps}
                  mosaic={isAlbum ? data.art?.lg || data.image : null}
                  moreCount={moreCount}
                  moreUrl={data.externalUrl}
                />
              ) : (
                <>
                  <TrackList {...viewProps} />
                  <MoreOnSpotify count={moreCount} url={data.externalUrl} />
                </>
              )}

              <Footer
                playlistUrl={data.externalUrl}
                album={isAlbum}
                onRandom={handleRandom}
                canShuffle={playableCount > 0}
                radio={radio}
                onRadio={allSources.length > 1 ? toggleRadio : null}
                onQuiz={playableCount >= 4 ? openQuiz : null}
              />
            </>
          ) : null}
        </main>

        {/* No hace falta excluirlo cuando esta el mini: el hint desaparece con
            `touched`, que se pone al reproducir, y el mini solo existe si algo
            suena. Nunca coinciden. */}
        {data && !touched ? (
          <p className="hint">
            Click para reproducir &middot; arrastra o usa las flechas &middot; <kbd>?</kbd> atajos
          </p>
        ) : null}
      </div>

      {ended && !radio && data ? (
        <EndCard
          name={data.name}
          next={nextSource}
          onNext={() => hopTo(nextSource, 'first')}
          onRadio={toggleRadio}
          onRestart={() => {
            setEnded(false);
            const first = findPlayable(-1, 1);
            if (first !== -1) startTrack(first);
          }}
          onClose={() => setEnded(false)}
        />
      ) : null}

      {quizOpen && data && !loading ? (
        <Quiz
          key={data.id}
          pool={quizPool}
          sourceName={data.name}
          player={player}
          onClose={closeQuiz}
          onShareResult={shareQuizResult}
        />
      ) : null}

      {nowOpen && currentTrack ? (
        <NowPlaying
          track={currentTrack}
          isPlaying={player.isPlaying}
          duration={player.duration}
          subscribePosition={player.subscribePosition}
          onToggle={toggle}
          onSeek={seek}
          onPrev={() => skip(-1)}
          onNext={() => skip(1)}
          onShare={() => handleShare(playingIndex)}
          onStory={() => handleStory(playingIndex)}
          reactions={reactions.enabled ? reactions : null}
          onClose={closeNow}
        />
      ) : null}

      <MiniPlayer
        track={currentTrack}
        onExpand={openNow}
        radio={radio}
        onRadio={toggleRadio}
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

      {showKeys ? <ShortcutsPanel onClose={closeKeys} /> : null}

      <Toast toast={toast} />
    </>
  );
}
