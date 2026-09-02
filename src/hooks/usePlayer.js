import { useCallback, useEffect, useRef, useState } from 'react';
import { disableGraph, isGraphEnabled, resumeGraph, routeDeck } from '../lib/analyser.js';

/**
 * Reproductor de dos pistas con crossfade.
 *
 * Usa dos elementos <audio> que se alternan: mientras uno suena, el otro carga
 * el tema siguiente; al cambiar se cruzan las ganancias. El fundido se hace
 * rampando `volume` y no con ganancias de Web Audio, para que la reproduccion
 * no dependa del grafo: si el analizador no esta disponible, el audio sigue
 * funcionando igual.
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
   arriba y a todo trapo asustan a quien entra con los cascos puestos. No hay
   control en pantalla a proposito: `volume` es de solo lectura en Safari de
   iOS, asi que un mando visible estaria muerto justo donde mas molesta el
   susto. Aqui el techo se ignora en silencio y el resto de navegadores lo
   respetan. Es tambien el destino del fundido: la rampa apunta a este valor,
   no a 1. */
const MAX_VOLUME = 0.75;

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
  deck.volume = 0;
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
    if (to) to.volume = MAX_VOLUME;

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
      const fromVolume = from ? from.volume : 0;

      /* El origen del tiempo se toma del primer frame, no de performance.now():
         mezclar ambos relojes asume que comparten origen, y si no lo hacen el
         progreso sale negativo y el fundido no termina nunca. */
      let start = null;

      const step = (now) => {
        if (start === null) start = now;
        const progress = fadeMs <= 0 ? 1 : Math.min(1, (now - start) / fadeMs);

        if (from && from !== to) from.volume = Math.max(0, fromVolume * (1 - progress));
        to.volume = MAX_VOLUME * progress;

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
        deck.volume = 0;
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

  return { ...status, play, toggle, seek, stop, preload, subscribePosition, getPosition };
}
