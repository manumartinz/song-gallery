import { memo, useCallback } from 'react';
import Cover from './Cover.jsx';
import EqBars from './EqBars.jsx';
import usePlaybackPosition from '../hooks/usePlaybackPosition.js';

/**
 * Indicador de avance de la celda que suena.
 *
 * Vive en su propio componente para que la suscripcion a la posicion no obligue
 * a repintar la celda entera (portada, velo, textos) veinte veces por segundo:
 * lo unico que cambia es una variable CSS.
 */
function CellProgress({ subscribePosition, duration }) {
  const position = usePlaybackPosition(subscribePosition);
  const progress = duration ? Math.min(1, position / duration) : 0;
  return <span className="cell__progress" style={{ '--progress': progress }} />;
}

/**
 * Vista en mosaico: solo portadas, muy juntas, y el texto aparece al pasar
 * el raton.
 *
 * Las imagenes van con draggable={false} y pointer-events desactivados: sin
 * eso, arrastrar para desplazar la pagina o bien seleccionaba las portadas en
 * azul o bien el navegador se las llevaba con su arrastre nativo de imagenes.
 */
function GridCell({
  track,
  index,
  isFocused,
  isCurrent,
  isPlaying,
  playable,
  pending,
  slot,
  subscribePosition,
  duration,
  register,
  onSelect,
  onHover,
}) {
  const setNode = useCallback((node) => register(index, node), [register, index]);
  const handleClick = useCallback(() => onSelect(index), [onSelect, index]);
  const handleEnter = useCallback(() => onHover(index), [onHover, index]);

  const className = [
    'cell',
    isCurrent ? 'cell--current' : '',
    isFocused ? 'cell--focused' : '',
    playable || pending ? '' : 'cell--dead',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li ref={setNode} className={className} style={{ '--i': slot }}>
      <button
        type="button"
        className="cell__hit"
        onClick={handleClick}
        onMouseEnter={handleEnter}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') event.preventDefault();
        }}
        aria-current={isCurrent ? 'true' : undefined}
        aria-label={
          playable
            ? `Reproducir ${track.title} de ${track.artistLine}`
            : `${track.title} de ${track.artistLine} (sin preview disponible)`
        }
      >
        <Cover art={track.art} sizes="clamp(88px, 11vw, 150px)" />

        <span className="cell__veil">
          <span className="cell__title">{track.title}</span>
          <span className="cell__artist">{track.artistLine}</span>
          {!playable ? <span className="tag--badge">Sin preview</span> : null}
        </span>

        {/* Distintivo de la que suena: barras animadas si esta sonando,
            triangulo de play si esta en pausa. En la cuadricula no hay ficha
            desplegada, asi que este icono es lo unico que lo distingue. */}
        {isCurrent ? (
          <span className={`cell__mark${isPlaying ? ' cell__mark--live' : ''}`}>
            {isPlaying ? (
              <EqBars playing />
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            )}
          </span>
        ) : null}

        {/* Indicador, no control: una celda de ~100 px no permite apuntar con
            precision suficiente para arrastrar. Se ajusta desde la lista. */}
        {isCurrent ? (
          <CellProgress subscribePosition={subscribePosition} duration={duration} />
        ) : null}
      </button>
    </li>
  );
}

const Cell = memo(GridCell);

export default function TrackGrid({
  items,
  focusedIndex,
  playingIndex,
  isPlayable,
  isPending,
  isPlaying,
  subscribePosition,
  duration,
  register,
  onSelect,
  onHover,
  onPointerDown,
}) {
  return (
    <ul className="grid" onPointerDown={onPointerDown} onMouseLeave={() => onHover(null)}>
      {items.map(({ track, index }, slot) => {
        const isCurrent = index === playingIndex;
        return (
          <Cell
            key={`${track.id}-${index}`}
            track={track}
            index={index}
            slot={slot}
            isFocused={index === focusedIndex}
            isCurrent={isCurrent}
            playable={isPlayable(index)}
            pending={isPending(index)}
            isPlaying={isPlaying}
            subscribePosition={subscribePosition}
            duration={isCurrent ? duration : 0}
            register={register}
            onSelect={onSelect}
            onHover={onHover}
          />
        );
      })}
    </ul>
  );
}
