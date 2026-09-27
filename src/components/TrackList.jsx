import TrackRow from './TrackRow.jsx';

const NONE = {};

/** Las reacciones propias de una pista como cadena: estable entre renders. */
function mineFor(mine, id) {
  return ['love', 'new'].filter((kind) => mine.has(`${id}:${kind}`)).join(',');
}

/**
 * `items` viene ya filtrado y ordenado: cada entrada trae la pista y su indice
 * ORIGINAL en la playlist, que es la identidad con la que trabaja todo el
 * estado de la app. `slot` es la posicion visible, que solo sirve para la
 * numeracion y el escalonado de entrada.
 */
export default function TrackList({
  items,
  album,
  focusedIndex,
  playingIndex,
  selectedIndex,
  isPlayable,
  isPending,
  heard,
  isPlaying,
  subscribePosition,
  duration,
  register,
  onSelect,
  onHover,
  onSeek,
  onShare,
  onStory,
  reactions,
  onExpand,
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
            album={album}
            isFocused={index === focusedIndex}
            isCurrent={isCurrent}
            isOpen={index === selectedIndex}
            isPlaying={isPlaying}
            playable={isPlayable(index)}
            pending={isPending(index)}
            heard={heard?.has(track.id) ?? false}
            /* La posicion ya no baja por aqui: la barra se suscribe al
               reproductor. Este prop es una funcion estable, asi que el memo
               de las filas sigue aguantando. */
            subscribePosition={subscribePosition}
            duration={isCurrent ? duration : 0}
            register={register}
            onSelect={onSelect}
            onHover={onHover}
            onSeek={onSeek}
            onShare={onShare}
            onStory={onStory}
            /* Por fila y no el objeto entero: asi una reaccion solo repinta la
               fila que la recibe, y el memo de las demas aguanta. */
            reaction={reactions ? reactions.counts[track.id] || NONE : null}
            reacted={reactions ? mineFor(reactions.mine, track.id) : ''}
            onReact={reactions ? reactions.toggle : null}
            onExpand={isCurrent ? onExpand : null}
          />
        );
      })}
    </ul>
  );
}
