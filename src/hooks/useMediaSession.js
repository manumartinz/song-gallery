import { useEffect, useRef } from 'react';

const SEEK_STEP = 10; // segundos de los botones de adelantar/atrasar del sistema

/**
 * Controles del sistema: pantalla bloqueada, notificacion de Android, teclas
 * multimedia y botones de los auriculares.
 *
 * Sin los manejadores, el sistema solo sabia pintar el titulo y la portada: el
 * boton de siguiente de unos auriculares Bluetooth no hacia nada, y en iOS el
 * de pausa pausaba el <audio> por su cuenta sin que la app se enterase.
 *
 * Los manejadores se registran UNA vez y leen la ultima version de cada accion
 * por una ref: registrarlos en cada render los reemplazaria veinte veces por
 * segundo mientras suena algo.
 */
export default function useMediaSession({
  track,
  isPlaying,
  duration,
  getPosition,
  onPlay,
  onPause,
  onPrev,
  onNext,
  onSeek,
}) {
  const actions = useRef({});
  actions.current = { getPosition, duration, onPlay, onPause, onPrev, onNext, onSeek };

  useEffect(() => {
    if (!('mediaSession' in navigator)) return undefined;

    const call = (name, ...args) => actions.current[name]?.(...args);

    // Un salto desde el sistema no pasa por el efecto de abajo: se avisa aqui.
    const seek = (seconds) => {
      const { duration } = actions.current;
      call('onSeek', seconds);
      if (!duration || !navigator.mediaSession.setPositionState) return;
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(duration, Math.max(0, seconds)),
        });
      } catch {
        /* idem */
      }
    };

    const handlers = {
      play: () => call('onPlay'),
      pause: () => call('onPause'),
      previoustrack: () => call('onPrev'),
      nexttrack: () => call('onNext'),
      seekto: (details) => seek(details.seekTime),
      seekbackward: (details) =>
        seek(actions.current.getPosition() - (details.seekOffset || SEEK_STEP)),
      seekforward: (details) =>
        seek(actions.current.getPosition() + (details.seekOffset || SEEK_STEP)),
    };

    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* accion que este navegador no conoce: se sigue con las demas */
      }
    }

    return () => {
      for (const action of Object.keys(handlers)) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          /* idem */
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artistLine,
      album: track.album || '',
      artwork: track.art?.lg
        ? [{ src: track.art.lg, sizes: '640x640', type: 'image/jpeg' }]
        : [],
    });
  }, [track]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = track ? (isPlaying ? 'playing' : 'paused') : 'none';

    /* La barra del sistema extrapola sola a partir de aqui, asi que basta con
       darle la posicion al cambiar de tema, al pausar y al reanudar. */
    if (!track || !duration || !navigator.mediaSession.setPositionState) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(duration, Math.max(0, getPosition())),
      });
    } catch {
      /* posicion fuera de rango en un instante de cambio de tema */
    }
  }, [track, isPlaying, duration, getPosition]);
}
