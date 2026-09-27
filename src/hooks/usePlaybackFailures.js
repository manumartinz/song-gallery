import { useEffect, useRef } from 'react';
import { trackEvent } from '../lib/clarity.js';

/**
 * Qué hacer cuando una pista falla de verdad al arrancar.
 *
 * Se marca como no reproducible y se salta a la siguiente. Sin esto la app
 * seguia creyendo que sonaba (el playingIndex se fija antes de confirmar), y el
 * siguiente click sobre ella iba a toggle() en vez de a play(): de ahi que se
 * quedase pegada.
 *
 * `retriedKeys` lo crea App y lo vacia al cambiar de fuente: es por fuente, y
 * la carga vive en otro hook.
 */
export default function usePlaybackFailures({
  player,
  retriedKeys,
  findPlayable,
  startTrack,
  expirePreview,
  resolveNow,
  setUnplayable,
  setPlayingIndex,
  setPlayWhenReady,
}) {
  const failStreak = useRef(0);
  const handledFailure = useRef(null);

  useEffect(() => {
    if (player.isPlaying) {
      failStreak.current = 0;
      handledFailure.current = null;
    }
  }, [player.isPlaying]);

  useEffect(() => {
    const failed = player.failedKey;
    /* Solo las claves de la lista son indices. El juego reproduce por el mismo
       motor con claves propias, y sus fallos los lleva el. */
    if (player.error == null || typeof failed !== 'number') return;
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
    trackEvent('preview_failed');
    setPlayingIndex(-1);

    // Guardarrail: si fallan varias seguidas no recorremos la lista sola.
    failStreak.current += 1;
    if (failStreak.current > 3) return;

    const next = findPlayable(failed, 1);
    if (next !== -1) startTrack(next);
  }, [
    player.error,
    player.failedKey,
    retriedKeys,
    findPlayable,
    startTrack,
    expirePreview,
    resolveNow,
    setUnplayable,
    setPlayingIndex,
    setPlayWhenReady,
  ]);
}
