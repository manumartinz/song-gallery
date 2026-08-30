import Cover from './Cover.jsx';
import PlayGlyph from './PlayGlyph.jsx';
import Scrubber from './Scrubber.jsx';

/**
 * Barra fija con lo que esta sonando.
 *
 * Aparece SOLO cuando la fila activa se ha ido de pantalla: mientras se la ve,
 * esa fila ya trae portada, ficha y barra de progreso, y repetirlas abajo seria
 * ruido. Antes de esto, alejarse con el scroll dejaba la reproduccion sin
 * ningun control a la vista.
 *
 * La posicion entra por `subscribePosition`, NUNCA como prop. Se refresca 20
 * veces por segundo: pasarla como prop obligaria a re-renderizar App y la lista
 * entera a esa frecuencia, que es justo el atasco que costo quitar. Asi el
 * unico que se repinta es el Scrubber.
 */
export default function MiniPlayer({
  track,
  isPlaying,
  duration,
  subscribePosition,
  shown,
  onToggle,
  onSeek,
  onPrev,
  onNext,
  onFocusRow,
}) {
  if (!track) return null;

  // Oculto no debe ser alcanzable con el tabulador ni por el lector de pantalla.
  const reachable = shown ? 0 : -1;

  return (
    <div className={`mini${shown ? ' mini--in' : ''}`} aria-hidden={shown ? undefined : 'true'}>
      <button
        type="button"
        className="mini__id"
        onClick={onFocusRow}
        tabIndex={reachable}
        aria-label={`Ir a ${track.title}, de ${track.artistLine}`}
      >
        <span className="mini__art">
          <Cover art={track.art} sizes="44px" />
        </span>
        <span className="mini__text">
          <span className="mini__title">{track.title}</span>
          <span className="mini__artist">{track.artistLine}</span>
        </span>
      </button>

      <div className="mini__controls">
        <button type="button" onClick={onPrev} tabIndex={reachable} aria-label="Anterior">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17 5.5v13L8 12zM7 5.5v13" />
          </svg>
        </button>

        <button
          type="button"
          className="mini__play"
          onClick={onToggle}
          tabIndex={reachable}
          aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
        >
          <PlayGlyph playing={isPlaying} />
        </button>

        <button type="button" onClick={onNext} tabIndex={reachable} aria-label="Siguiente">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 5.5v13L16 12zM17 5.5v13" />
          </svg>
        </button>
      </div>

      <div className="mini__bar">
        <Scrubber subscribePosition={subscribePosition} duration={duration} onSeek={onSeek} />
      </div>
    </div>
  );
}
