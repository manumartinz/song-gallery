import { useEffect, useRef } from 'react';
import { noteFor } from '../config/notes.js';
import Cover from './Cover.jsx';
import PlayGlyph from './PlayGlyph.jsx';
import Reactions from './Reactions.jsx';
import Scrubber from './Scrubber.jsx';
import Visualizer from './Visualizer.jsx';

/**
 * "Ahora suena" a pantalla completa: portada grande, titulo, la nota si la
 * hay, el espectro y los controles. Es la vista que se captura y se comparte,
 * asi que no lleva nada mas.
 *
 * El fondo difuminado de la pagina sigue detras; el resto de la pagina se
 * esconde mientras esto esta abierto. Se cierra con Escape, con la flecha de arriba
 * o deslizando hacia abajo en tactil.
 */
export default function NowPlaying({
  track,
  isPlaying,
  duration,
  subscribePosition,
  onToggle,
  onSeek,
  onPrev,
  onNext,
  onShare,
  onStory,
  reactions,
  onClose,
}) {
  const closeRef = useRef(null);
  const startY = useRef(null);
  const note = noteFor(track?.id);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    /* La pagina se retira entera y queda solo el fondo difuminado, que es la
       propia portada: la lista asomando por detras competia con todo. */
    document.body.classList.add('is-now');
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.body.classList.remove('is-now');
    };
  }, [onClose]);

  if (!track) return null;

  return (
    <div
      className="now"
      role="dialog"
      aria-modal="true"
      aria-label={`Ahora suena: ${track.title}, de ${track.artistLine}`}
      onTouchStart={(event) => {
        startY.current = event.touches[0].clientY;
      }}
      onTouchEnd={(event) => {
        // Deslizar hacia abajo cierra, como en cualquier reproductor del movil.
        const from = startY.current;
        startY.current = null;
        if (from !== null && event.changedTouches[0].clientY - from > 90) onClose();
      }}
    >
      <button
        ref={closeRef}
        type="button"
        className="now__close"
        onClick={onClose}
        aria-label="Cerrar"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>

      <div className="now__body">
        <div className="now__art">
          <Cover art={track.art} sizes="(max-width: 720px) 80vw, 420px" />
        </div>

        <div className="now__text">
          <h2 className="now__title">{track.title}</h2>
          <p className="now__artist">{track.artistLine}</p>
          {note ? <blockquote className="now__note">{note}</blockquote> : null}
        </div>

        <Visualizer playing={isPlaying} />

        <div className="now__bar">
          <Scrubber subscribePosition={subscribePosition} duration={duration} onSeek={onSeek} />
        </div>

        <div className="now__controls">
          <button type="button" onClick={onPrev} aria-label="Anterior">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17 5.5v13L8 12zM7 5.5v13" />
            </svg>
          </button>
          <button
            type="button"
            className="now__play"
            onClick={onToggle}
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          >
            <PlayGlyph playing={isPlaying} />
          </button>
          <button type="button" onClick={onNext} aria-label="Siguiente">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 5.5v13L16 12zM17 5.5v13" />
            </svg>
          </button>
        </div>

        {reactions ? (
          <Reactions
            id={track.id}
            counts={reactions.counts[track.id]}
            mine={reactions.mine}
            onToggle={reactions.toggle}
          />
        ) : null}

        <div className="now__extras">
          {onShare ? (
            <button type="button" onClick={onShare}>
              Compartir
            </button>
          ) : null}
          {onStory ? (
            <button type="button" onClick={onStory}>
              Historia para Instagram
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
