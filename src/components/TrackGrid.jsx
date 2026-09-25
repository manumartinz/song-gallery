import { memo, useCallback } from 'react';
import useMediaQuery from '../hooks/useMediaQuery.js';
import Cover from './Cover.jsx';
import EqBars from './EqBars.jsx';
import MoreOnSpotify from './MoreOnSpotify.jsx';
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
/**
 * El trozo de portada que le toca a una casilla del mosaico de un album.
 *
 * Es la portada ENTERA, del tamaño de toda la reticula, desplazada para que por
 * la ventana de la casilla asome solo su parte. Todas piden la misma URL, asi
 * que el navegador la descarga una vez.
 */
function Piece({ src, slot, cols }) {
  return (
    <img
      className="cell__piece"
      src={src}
      alt=""
      decoding="async"
      draggable={false}
      style={{ '--col': slot % cols, '--row': Math.floor(slot / cols) }}
    />
  );
}

function GridCell({
  track,
  index,
  mosaic,
  cols,
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
    mosaic ? 'cell--piece' : '',
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
        {mosaic ? (
          <Piece src={mosaic} slot={slot} cols={cols} />
        ) : (
          <Cover art={track.art} sizes="clamp(88px, 11vw, 150px)" />
        )}

        <span className="cell__veil">
          {/* En un album el artista es el mismo en todas: lo que distingue a
              cada casilla es su numero de pista. */}
          {mosaic && track.trackNumber ? (
            <span className="cell__num">{String(track.trackNumber).padStart(2, '0')}</span>
          ) : null}
          <span className="cell__title">{track.title}</span>
          {mosaic ? null : <span className="cell__artist">{track.artistLine}</span>}
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

/* Columnas del mosaico de un album: las justas para que la portada quede lo
   mas cuadrada posible (13 pistas, 4 x 4). Con topes: por debajo de 3 las
   casillas serian enormes, y por encima de 5 —4 en movil— cada trozo es tan
   pequeño que ya no se lee la portada ni el titulo. */
function mosaicColumns(total, compact) {
  return Math.min(compact ? 4 : 5, Math.max(3, Math.ceil(Math.sqrt(total))));
}

export default function TrackGrid({
  items,
  mosaic = null,
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
  moreCount = 0,
  moreUrl = null,
}) {
  const compact = useMediaQuery('(max-width: 720px)');

  /* Un album no tiene una portada por cancion, tiene UNA. En vez de repetirla
     en cada casilla se reparte: la reticula entera es la portada y cada
     cancion es un trozo. Ordenar o filtrar mueve las canciones, no el dibujo,
     porque el trozo va por posicion y no por pista. */
  const moreSlot = moreUrl && moreCount > 0 ? 1 : 0;
  const total = items.length + moreSlot;
  const cols = mosaic ? mosaicColumns(total, compact) : 0;
  const rows = mosaic ? Math.ceil(total / cols) : 0;

  /* Los huecos de la ultima fila se rellenan con su trozo, sin cancion: sin
     ellos a la portada le faltaria una esquina. */
  const fillers = mosaic ? cols * rows - total : 0;

  return (
    <ul
      className={`grid${mosaic ? ' grid--mosaic' : ''}`}
      style={mosaic ? { '--cols': cols, '--rows': rows } : undefined}
      onPointerDown={onPointerDown}
      onMouseLeave={() => onHover(null)}
    >
      {items.map(({ track, index }, slot) => {
        const isCurrent = index === playingIndex;
        return (
          <Cell
            key={`${track.id}-${index}`}
            track={track}
            index={index}
            slot={slot}
            mosaic={mosaic}
            cols={cols}
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

      {/* Cierra la reticula como una casilla mas. `slot` sigue la cuenta de las
          demas para que herede el escalonado de entrada en vez de aparecer de
          golpe cuando las otras aun estan entrando. */}
      <MoreOnSpotify
        variant="grid"
        count={moreCount}
        url={moreUrl}
        slot={items.length}
        onHover={onHover}
      />

      {Array.from({ length: fillers }, (_, n) => {
        const slot = total + n;
        return (
          <li key={`fill-${slot}`} className="cell cell--piece cell--fill" aria-hidden="true" style={{ '--i': slot }}>
            <Piece src={mosaic} slot={slot} cols={cols} />
          </li>
        );
      })}
    </ul>
  );
}
