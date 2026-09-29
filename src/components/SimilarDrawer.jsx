import { useEffect, useRef } from 'react';
import Cover from './Cover.jsx';
import SimilarPanel from './SimilarPanel.jsx';

/**
 * «Parecidas a esta» para la cuadrícula, que no tiene ficha donde ponerlo:
 * un panel a la derecha (una hoja desde abajo en angosto) que se abre con el
 * ✦ de una celda.
 *
 * No es un modal a propósito: se escucha una parecida y se sigue mirando la
 * cuadrícula, o se abre el de otra celda y el panel cambia de canción. Se
 * cierra con Escape o con la cruz.
 *
 * `track` es la canción de partida entera y no un índice: al sonar una
 * parecida ninguna fila es «la que suena», y el panel tiene que seguir
 * sabiendo de qué habla.
 */
export default function SimilarDrawer({ track, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, [track?.id]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!track) return null;

  return (
    <aside className="drawer" aria-label={`Parecidas a ${track.title}`} data-no-drag>
      <header className="drawer__head">
        <div className="drawer__art">
          <Cover art={track.art} sizes="48px" />
        </div>
        <div className="drawer__text">
          <span className="drawer__eyebrow">Parecidas a</span>
          <span className="drawer__title">{track.title}</span>
          <span className="drawer__artist">{track.artistLine}</span>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="drawer__close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <SimilarPanel trackId={track.id} autoLoad />
    </aside>
  );
}
