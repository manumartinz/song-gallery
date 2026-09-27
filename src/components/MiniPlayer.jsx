import Cover from './Cover.jsx';
import PlayGlyph from './PlayGlyph.jsx';
import Scrubber from './Scrubber.jsx';
import useSwipe from '../hooks/useSwipe.js';

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
 *
 * En tactil se desliza: a la izquierda la siguiente, a la derecha la anterior
 * y hacia arriba la vista grande, como en cualquier reproductor del movil.
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
  radio = false,
  onRadio,
  onExpand,
}) {
  const { handlers, followRef, swiped } = useSwipe({
    onLeft: onNext,
    onRight: onPrev,
    onUp: onExpand,
  });

  if (!track) return null;

  // Oculto no debe ser alcanzable con el tabulador ni por el lector de pantalla.
  const reachable = shown ? 0 : -1;

  return (
    <div
      className={`mini${shown ? ' mini--in' : ''}`}
      aria-hidden={shown ? undefined : 'true'}
      {...handlers}
    >
      <button
        ref={followRef}
        type="button"
        className="mini__id"
        onClick={() => {
          // El click que sigue a un gesto no es un toque.
          if (!swiped()) onFocusRow();
        }}
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
        {/* Solo con la radio encendida: es su interruptor de apagado, y decir
            "radio" sobre un tema cualquiera explica por que ha cambiado de
            playlist sola. */}
        {radio ? (
          <button
            type="button"
            className="mini__radio"
            onClick={onRadio}
            tabIndex={reachable}
            aria-label="Apagar la radio"
            title="Apagar la radio"
          >
            Radio
          </button>
        ) : null}

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

        {onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            tabIndex={reachable}
            aria-label="Ver a pantalla completa"
            title="Ahora suena (f)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 14.5l6-6 6 6" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="mini__bar">
        <Scrubber subscribePosition={subscribePosition} duration={duration} onSeek={onSeek} />
      </div>
    </div>
  );
}
