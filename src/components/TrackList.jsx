import TrackRow from './TrackRow.jsx';

/**
 * `items` viene ya filtrado y ordenado: cada entrada trae la pista y su indice
 * ORIGINAL en la playlist, que es la identidad con la que trabaja todo el
 * estado de la app. `slot` es la posicion visible, que solo sirve para la
 * numeracion y el escalonado de entrada.
 */
export default function TrackList({
  items,
  focusedIndex,
  playingIndex,
  selectedIndex,
  isPlayable,
  isPending,
  isPlaying,
  subscribePosition,
  duration,
  register,
  onSelect,
  onHover,
  onSeek,
  onPointerDown,
}) {
  return (
    <ul className="list" onPointerDown={onPointerDown} onMouseLeave={() => onHover(null)}>
      {items.map(({ track, index }, slot) => {
        const isCurrent = index === playingIndex;
        return (
          <TrackRow
            key={`${track.id}-${index}`}
            track={track}
            index={index}
            slot={slot}
            isFocused={index === focusedIndex}
            isCurrent={isCurrent}
            isOpen={index === selectedIndex}
            isPlaying={isPlaying}
            playable={isPlayable(index)}
            pending={isPending(index)}
            /* La posicion ya no baja por aqui: la barra se suscribe al
               reproductor. Este prop es una funcion estable, asi que el memo
               de las filas sigue aguantando. */
            subscribePosition={subscribePosition}
            duration={isCurrent ? duration : 0}
            register={register}
            onSelect={onSelect}
            onHover={onHover}
            onSeek={onSeek}
          />
        );
      })}
    </ul>
  );
}
