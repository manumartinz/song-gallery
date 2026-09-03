import { useCallback, useEffect, useRef, useState } from 'react';
import {
  disableGraph,
  getDeckLevel,
  isGraphEnabled,
  resumeGraph,
  routeDeck,
  setDeckLevel,
} from '../lib/analyser.js';

/**
 * Reproductor de dos pistas con crossfade.
 *
 * Usa dos elementos <audio> que se alternan: mientras uno suena, el otro carga
 * el tema siguiente; al cambiar se cruzan sus niveles.
 *
 * El nivel de un deck se escribe por uno de dos caminos, nunca por los dos:
 * `volume` del elemento mientras esta suelto, y su ganancia de Web Audio en
 * cuanto entra en el grafo (ver `setLevel`). Asi el audio no depende del grafo
 * —sin analizador se sigue oyendo y fundiendo por el elemento— y a la vez el
 * mando de volumen y el fundido funcionan en Safari de iOS, donde `volume` es
 * de solo lectura.
 *
 * INVARIANTE que sostiene todo lo demas: como mucho un deck es audible, y es
 * el de la ultima pista pedida. Si el motor dice que no suena nada, no se oye
 * nada.
 *
 * Mantenerlo exige tres cosas que no son obvias:
 *
 *  1. Cada deck lleva el `seq` de la peticion que lo posee (`engine.owner`).
 *     Sin eso, la limpieza de un crossfade puede borrar un deck que otra
 *     peticion ya reclamo, matando la pista nueva y dejando sonando la vieja.
 *  2. Asignar `.src`, o llamar a `load()`/`removeAttribute('src')`, sobre un
 *     elemento con un `play()` pendiente RECHAZA esa promesa con AbortError.
 *     Es algo que provocamos nosotros al superponernos, asi que es benigno y
 *     nunca debe tratarse como un fallo de reproduccion.
 *  3. Un fundido interrumpido hay que LIQUIDARLO (saltarlo a su estado final),
 *     no solo cancelar su rAF: si no, el saliente se queda sonando a medio
 *     volumen y el entrante no llega a oirse nunca.
 */

const CROSSFADE_MS = 420;
const POSITION_HZ = 20; // suficiente para una barra fluida sin re-render de mas

/* Techo de volumen. Los previews de Deezer e iTunes vienen normalizados muy
   arriba y a todo trapo asustan a quien entra con los cascos puestos, asi que
   el mando de la barra reparte de aqui hacia abajo: al 100% se oye este 0.75,
   no un 1. Es tambien el destino del fundido: la rampa apunta al nivel
   efectivo, nunca a 1. */
const MAX_VOLUME = 0.75;

const VOLUME_KEY = 'song-gallery:volume';

/* Con lo que se abre quien llega por primera vez: un sexto del mando. Sobre el
   techo son ~0.13 de volumen real, que es a lo que se puede recibir a alguien
   con los cascos puestos sin pedirle perdon. Subir es un gesto; bajar de un
   susto, un manotazo. */
const DEFAULT_VOLUME = 0.17;

/** A 0..1, con dos decimales: los escalones del teclado no arrastran colas. */
function clampVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, Math.round(number * 100) / 100));
}

/** Volumen guardado, 0..1, o el de partida si no hay nada guardado. */
function readStoredVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null || !Number.isFinite(Number(raw))) return DEFAULT_VOLUME;
    return clampVolume(raw);
  } catch {
    return DEFAULT_VOLUME;
  }
}

function persistVolume(value) {
  try {
    localStorage.setItem(VOLUME_KEY, String(value));
  } catch {
    /* sin persistencia, sigue funcionando en esta sesion */
  }
}

/**
 * Pone el nivel de un deck por el camino que corresponda.
 *
 * Un deck enrutado atenua con su ganancia de Web Audio y uno suelto con
 * `volume` del elemento, y NUNCA con los dos: escribir en ambos multiplicaria
 * las dos atenuaciones. `setDeckLevel` dice cual de los dos es. El camino por
 * el elemento es ademas el que Safari de iOS ignora en silencio, y por eso
 * alli el fundido y el techo solo existen desde que el deck esta en el grafo.
 */
function setLevel(deck, level) {
  if (!setDeckLevel(deck, level)) deck.volume = level;
}

/** El nivel actual, leido del mismo camino por el que se escribe. */
function getLevel(deck) {
  const routed = getDeckLevel(deck);
  return routed === null ? deck.volume : routed;
}

/* `position` NO esta aqui a proposito: se refresca 20 veces por segundo y en el
   estado obligaba a re-renderizar todo el arbol a esa frecuencia. Viaja por
   suscripcion (`subscribePosition`). La duracion si vive en el estado: cambia
   una vez por tema. */
const IDLE = {
  key: null,
  trackId: null,
  isPlaying: false,
  duration: 0,
  loading: false,
  error: null,
  failedKey: null,
};

function createDeck() {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.volume = 0;
  /* `crossOrigin` no se fija aqui sino justo antes de cada `src`, porque solo
     surte efecto si esta puesto de antemano. Tanto Deezer como iTunes
     responden con Access-Control-Allow-Origin, asi que el analizador puede
     leerlos; si alguna vez fallara, play() reintenta sin CORS. */
  return audio;
}

/** Detiene un deck y suelta su descarga. Aborta cualquier play() pendiente. */
function releaseDeck(deck) {
  deck.pause();
  deck.removeAttribute('src');
  deck.load();
  setLevel(deck, 0);
}

export default function usePlayer({ onEnded, crossfade = true } = {}) {
  const endedRef = useRef(onEnded);
  endedRef.current = onEnded;

  const engineRef = useRef(null);
  if (engineRef.current === null) {
    engineRef.current = {
      decks: [createDeck(), createDeck()],
      /* Elemento aparte, solo para calentar la cache del navegador con el tema
         siguiente. NUNCA suena ni se enruta, y a proposito no participa del
         modelo de propiedad de decks: meter la precarga ahi dentro era el
         camino corto para reabrir las carreras que costo tanto cerrar. */
      warm: createDeck(),
      owner: [-1, -1], // seq de la peticion dueña de cada deck
      active: -1, // deck audible, -1 si ninguno
      pending: -1, // deck con una carga en vuelo, -1 si ninguna
      fade: null,
      seq: 0,
    };
  }

  const [status, setStatus] = useState(IDLE);
  const statusRef = useRef(status);
  statusRef.current = status;

  const [volume, setVolumeState] = useState(readStoredVolume);
  const [muted, setMuted] = useState(false);

  /* Nivel al que suena un deck que este del todo dentro: el techo repartido por
     el mando. Vive en una ref ademas del estado porque lo leen los frames del
     fundido, que corren fuera de React; si leyeran el estado, cada fundido se
     quedaria con el volumen que hubiera al empezarlo y mover la barra a media
     cancion no se oiria hasta la siguiente. */
  const ceilingRef = useRef(0);
  ceilingRef.current = muted ? 0 : MAX_VOLUME * volume;

  /* Canal aparte para la posicion, fuera del estado de React. Quien la muestre
     se suscribe y se repinta solo el; los demas ni se enteran. */
  const positionRef = useRef(0);
  const positionSubsRef = useRef(new Set());

  const publishPosition = useCallback((seconds) => {
    if (positionRef.current === seconds) return;
    positionRef.current = seconds;
    positionSubsRef.current.forEach((notify) => notify(seconds));
  }, []);

  const subscribePosition = useCallback((notify) => {
    positionSubsRef.current.add(notify);
    notify(positionRef.current); // arranca con el valor actual, sin esperar al tick
    return () => positionSubsRef.current.delete(notify);
  }, []);

  /** Para quien necesite leerla puntualmente (el salto con las flechas). */
  const getPosition = useCallback(() => positionRef.current, []);

  const fadeMs = crossfade ? CROSSFADE_MS : 0;

  /** Salta el fundido en curso a su estado final en vez de dejarlo a medias. */
  const settleFade = useCallback((engine) => {
    const fade = engine.fade;
    if (!fade) return;

    cancelAnimationFrame(fade.raf);
    engine.fade = null;

    const to = engine.decks[fade.toIndex];
    if (to) setLevel(to, ceilingRef.current);

    // Solo se libera el saliente si nadie lo ha reclamado desde entonces.
    if (fade.fromIndex !== -1 && fade.fromIndex !== fade.toIndex) {
      if (engine.owner[fade.fromIndex] === fade.fromOwner) {
        releaseDeck(engine.decks[fade.fromIndex]);
      }
    }
  }, []);

  const startFade = useCallback(
    (engine, fromIndex, toIndex) => {
      settleFade(engine); // liquida el anterior antes de encadenar otro

      const from = fromIndex === -1 ? null : engine.decks[fromIndex];
      const to = engine.decks[toIndex];
      const fromOwner = fromIndex === -1 ? -1 : engine.owner[fromIndex];
      const fromLevel = from ? getLevel(from) : 0;

      /* El origen del tiempo se toma del primer frame, no de performance.now():
         mezclar ambos relojes asume que comparten origen, y si no lo hacen el
         progreso sale negativo y el fundido no termina nunca. */
      let start = null;

      const step = (now) => {
        if (start === null) start = now;
        const progress = fadeMs <= 0 ? 1 : Math.min(1, (now - start) / fadeMs);

        if (from && from !== to) setLevel(from, Math.max(0, fromLevel * (1 - progress)));
        setLevel(to, ceilingRef.current * progress);

        if (progress < 1) {
          engine.fade.raf = requestAnimationFrame(step);
          return;
        }

        engine.fade = null;
        // Misma guarda que en settleFade: el deck pudo cambiar de dueño
        // mientras duraba el fundido, y borrarlo mataria la pista nueva.
        if (from && from !== to && engine.owner[fromIndex] === fromOwner) {
          releaseDeck(from);
        }
      };

      engine.fade = { raf: requestAnimationFrame(step), fromIndex, toIndex, fromOwner };
    },
    [fadeMs, settleFade],
  );

  /** Deck donde cargar lo siguiente, sin pisar nunca el que esta sonando. */
  const pickDeck = useCallback((engine) => {
    // Si ya hay una carga en vuelo, se reutiliza ese deck: todavia no es
    // audible, asi que reemplazarlo no corta nada de lo que se oye.
    if (engine.pending !== -1) return engine.pending;
    return engine.active === -1 ? 0 : 1 - engine.active;
  }, []);

  const play = useCallback(
    (track, key) => {
      const engine = engineRef.current;
      if (!track?.previewUrl) return;

      // `key` desambigua playlists con la misma cancion repetida, donde el id
      // se repetiria y clicar la segunda copia pausaria en vez de sonar.
      const requestKey = key ?? track.id;

      // Ya es la que suena: alternar pausa/reanudacion en vez de reiniciarla.
      if (statusRef.current.key === requestKey && engine.active !== -1) {
        const deck = engine.decks[engine.active];
        if (deck.src) {
          if (deck.paused) {
            deck.play().catch(() => {});
            setStatus((s) => ({ ...s, isPlaying: true }));
          } else {
            deck.pause();
            setStatus((s) => ({ ...s, isPlaying: false }));
          }
          return;
        }
      }

      const seq = (engine.seq += 1);
      const index = pickDeck(engine);
      const deck = engine.decks[index];

      engine.owner[index] = seq;
      engine.pending = index;

      publishPosition(0); // tema nuevo: la barra no debe heredar la del anterior
      setStatus({ ...IDLE, key: requestKey, trackId: track.id, loading: true });

      /* `crossOrigin` debe fijarse ANTES de asignar src. Solo se pide cuando el
         visualizador sigue activo; si resultara que la fuente no admite CORS,
         se reintenta sin el en vez de dar el tema por roto. */
      const attempt = (withCors) => {
        setLevel(deck, 0);
        deck.crossOrigin = withCors ? 'anonymous' : null;
        deck.src = track.previewUrl; // aborta cualquier play() pendiente aqui
        deck.currentTime = 0;
        return deck.play();
      };

      const onPlaying = () => {
        // Dos guardas: que nadie haya reclamado este deck, y que no haya
        // llegado una peticion mas nueva mientras cargabamos.
        if (engine.owner[index] !== seq || engine.seq !== seq) return;

        engine.pending = -1;
        const fromIndex = engine.active;
        engine.active = index;

        // Se enruta con el audio ya cargado: nunca se enruta algo contaminado.
        resumeGraph();
        routeDeck(deck);

        setStatus((s) => (s.key === requestKey ? { ...s, isPlaying: true, loading: false } : s));
        startFade(engine, fromIndex, index);
      };

      const onFailed = (err, triedCors) => {
        // Nos superpusimos nosotros mismos: no es un fallo de reproduccion.
        if (err?.name === 'AbortError') return;
        if (engine.owner[index] !== seq || engine.seq !== seq) return;

        // El fallo puede venir de haber pedido CORS: un reintento sin el, y el
        // visualizador queda desactivado para el resto de la sesion.
        if (triedCors) {
          disableGraph();
          attempt(false)
            .then(onPlaying)
            .catch((again) => onFailed(again, false));
          return;
        }

        engine.pending = -1;
        // Invariante: si vamos a decir que no suena nada, que no se oiga nada.
        settleFade(engine);
        engine.decks.forEach(releaseDeck);
        engine.active = -1;

        setStatus({
          ...IDLE,
          error: 'No se pudo reproducir este tema.',
          failedKey: requestKey,
        });
      };

      const withCors = isGraphEnabled();
      attempt(withCors)
        .then(onPlaying)
        .catch((err) => onFailed(err, withCors));
    },
    [pickDeck, startFade, settleFade, publishPosition],
  );

  const toggle = useCallback(() => {
    const engine = engineRef.current;
    if (engine.active === -1) return;
    const deck = engine.decks[engine.active];
    if (!deck.src) return;

    if (deck.paused) {
      deck.play().catch(() => {});
      setStatus((s) => ({ ...s, isPlaying: true }));
    } else {
      deck.pause();
      setStatus((s) => ({ ...s, isPlaying: false }));
    }
  }, []);

  const seek = useCallback((seconds) => {
    const engine = engineRef.current;
    if (engine.active === -1) return;
    const deck = engine.decks[engine.active];
    if (!deck.src || !Number.isFinite(deck.duration)) return;
    deck.currentTime = Math.max(0, Math.min(seconds, deck.duration));
    publishPosition(deck.currentTime); // sin esperar al siguiente tick
  }, [publishPosition]);

  /**
   * Calienta la cache del navegador con el tema siguiente, para que el avance
   * automatico entre sin pausa. No reproduce: solo dispara la descarga, asi
   * que cuando el deck real pida esa URL ya la tiene servida.
   */
  const preload = useCallback((url) => {
    const warm = engineRef.current.warm;
    if (!url || warm.src === url) return;

    // Mismo criterio de CORS que los decks, o la cache no se reaprovecharia.
    warm.crossOrigin = isGraphEnabled() ? 'anonymous' : null;
    warm.src = url;
    warm.load();
  }, []);

  /**
   * Volumen del visitante, 0..1. Se reparte sobre el techo y no sobre el 1: el
   * maximo del mando es `MAX_VOLUME`.
   */
  const setVolume = useCallback((value) => {
    setVolumeState(clampVolume(value));
    if (Number(value) > 0) setMuted(false); // tocar la barra es querer oir algo
  }, []);

  /** Un escalon arriba o abajo. Funcional: los atajos no dependen del valor. */
  const nudgeVolume = useCallback((delta) => {
    setVolumeState((current) => clampVolume(current + delta));
    if (delta > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  /* Se guarda aqui y no dentro de los updaters: React puede invocarlos dos
     veces, y escribir en el almacenamiento desde ahi es pedir sorpresas. El
     silencio no se guarda a proposito: abrir la pagina muda seria un fallo.

     El primer pase no escribe. Si escribiera, a quien solo abre la web se le
     quedaria grabado el valor de partida, y a partir de ahi el de la casa ya no
     le llegaria nunca: solo se guarda lo que alguien ha decidido. */
  const volumeTouched = useRef(false);
  useEffect(() => {
    if (!volumeTouched.current) {
      volumeTouched.current = true;
      return;
    }
    persistVolume(volume);
  }, [volume]);

  /* Lleva el nivel nuevo al deck que suena. Durante un fundido no se toca: sus
     frames ya leen `ceilingRef` y escribir aqui pisaria la rampa a medias. */
  useEffect(() => {
    const engine = engineRef.current;
    if (engine.fade || engine.active === -1) return;
    const deck = engine.decks[engine.active];
    if (deck.src) setLevel(deck, ceilingRef.current);
  }, [volume, muted]);

  const stop = useCallback(() => {
    const engine = engineRef.current;
    engine.seq += 1; // invalida cualquier carga en vuelo
    engine.pending = -1;
    engine.active = -1;
    engine.owner = [-1, -1];

    if (engine.fade) {
      cancelAnimationFrame(engine.fade.raf);
      engine.fade = null;
    }
    engine.decks.forEach(releaseDeck);
    releaseDeck(engine.warm);
    publishPosition(0);
    setStatus(IDLE);
  }, [publishPosition]);

  // Bucle de posicion: leer currentTime a ~20 Hz da una barra mas suave que
  // el evento `timeupdate` del navegador, que dispara solo unas 4 veces/s.
  useEffect(() => {
    let raf = 0;
    let last = 0;

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 1000 / POSITION_HZ) return;
      last = now;

      const engine = engineRef.current;
      if (engine.active === -1) return;
      const deck = engine.decks[engine.active];
      if (!deck.src) return;

      // Mientras carga el tema nuevo, el deck activo sigue siendo el viejo:
      // publicar su posicion haria saltar la barra del tema entrante.
      if (statusRef.current.loading) return;

      publishPosition(deck.currentTime);

      // La duracion si pasa por el estado: cambia una vez por tema.
      const duration = Number.isFinite(deck.duration) ? deck.duration : 0;
      if (statusRef.current.duration !== duration) {
        setStatus((s) => (s.duration === duration ? s : { ...s, duration }));
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [publishPosition]);

  // Fin de tema -> avisa para que la lista avance sola.
  useEffect(() => {
    const engine = engineRef.current;
    const handleEnded = (event) => {
      if (engine.active === -1 || event.target !== engine.decks[engine.active]) return;
      setStatus((s) => ({ ...s, isPlaying: false }));
      endedRef.current?.();
    };

    const decks = engine.decks;
    decks.forEach((deck) => deck.addEventListener('ended', handleEnded));
    return () => decks.forEach((deck) => deck.removeEventListener('ended', handleEnded));
  }, []);

  // Silencia todo si el componente desaparece.
  useEffect(() => {
    const engine = engineRef.current;
    return () => {
      if (engine.fade) cancelAnimationFrame(engine.fade.raf);
      [...engine.decks, engine.warm].forEach((deck) => {
        deck.pause();
        deck.removeAttribute('src');
      });
    };
  }, []);

  return {
    ...status,
    volume,
    muted,
    play,
    toggle,
    seek,
    stop,
    preload,
    setVolume,
    nudgeVolume,
    toggleMute,
    subscribePosition,
    getPosition,
  };
}
