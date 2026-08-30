import { useCallback, useRef } from 'react';
import { formatSeconds } from '../lib/format.js';
import usePlaybackPosition from '../hooks/usePlaybackPosition.js';

/**
 * Barra de progreso arrastrable del tema activo.
 * Traduce la posicion del puntero a segundos y delega el salto en el player.
 *
 * La posicion se toma por suscripcion en vez de recibirla como prop: es el
 * unico componente de la lista que la necesita, y asi es el unico que se
 * repinta veinte veces por segundo.
 */
export default function Scrubber({ subscribePosition, duration, onSeek }) {
  const position = usePlaybackPosition(subscribePosition);
  const trackRef = useRef(null);
  const draggingRef = useRef(false);

  const seekFromEvent = useCallback(
    (event) => {
      const node = trackRef.current;
      if (!node || !duration) return;
      const rect = node.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      onSeek(ratio * duration);
    },
    [duration, onSeek],
  );

  const handlePointerDown = useCallback(
    (event) => {
      event.stopPropagation(); // no arrastrar la lista al mover la barra
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      seekFromEvent(event);
    },
    [seekFromEvent],
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (!draggingRef.current) return;
      seekFromEvent(event);
    },
    [seekFromEvent],
  );

  const handlePointerUp = useCallback((event) => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const progress = duration ? Math.min(1, position / duration) : 0;

  return (
    <div
      className="scrub"
      style={{ '--progress': progress }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={(event) => event.stopPropagation()}
      role="slider"
      tabIndex={0}
      aria-label="Posición de reproducción"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration) || 0}
      aria-valuenow={Math.round(position) || 0}
      aria-valuetext={formatSeconds(position)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.stopPropagation();
          onSeek(Math.max(0, position - 5));
        } else if (event.key === 'ArrowRight') {
          event.stopPropagation();
          onSeek(Math.min(duration, position + 5));
        }
      }}
    >
      <span className="scrub__times">
        {formatSeconds(position)} / {formatSeconds(duration)}
      </span>
      <div className="scrub__track" ref={trackRef}>
        <div className="scrub__fill" />
      </div>
      <span className="scrub__head" />
    </div>
  );
}
