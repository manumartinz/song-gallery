import { memo, useCallback } from 'react';
import Cover from './Cover.jsx';
import EqBars from './EqBars.jsx';
import PlayGlyph from './PlayGlyph.jsx';
import Scrubber from './Scrubber.jsx';
import { capitalize, formatDuration, formatFollowers, formatReleaseDate } from '../lib/format.js';

/**
 * Una fila de la lista.
 *
 * Distingue dos estados que antes estaban mezclados en uno solo:
 *   - isFocused: el raton esta encima o es el cursor de teclado. Solo resalta.
 *   - isCurrent: es la cancion que suena. Solo esta se expande con su ficha,
 *     muestra el ecualizador y pinta el fondo de la pagina.
 *
 * La barra de progreso ya no vive aqui sino en el mini-reproductor: tenerla
 * atada al hover hacia que cada fila por la que pasabas pareciese estar
 * avanzando, porque todas leian la posicion global del reproductor.
 *
 * `album` cambia la fila de forma cuando la fuente es un disco: la portada se
 * retira, porque repetir la misma caratula catorce veces no informa de nada, y
 * el glifo de reproduccion se muda encima del numero de pista, que es donde lo
 * busca la mano en cualquier lista de un album.
 */
function TrackRow({
  track,
  index,
  slot,
  album,
  isFocused,
  isCurrent,
  isOpen,
  isPlaying,
  playable,
  pending,
  subscribePosition,
  duration,
  register,
  onSelect,
  onHover,
  onSeek,
}) {
  const setNode = useCallback((node) => register(index, node), [register, index]);
  const handleClick = useCallback(() => onSelect(index), [onSelect, index]);
  const handleEnter = useCallback(() => onHover(index), [onHover, index]);

  const releaseLabel = formatReleaseDate(track.releaseDate);
  const followers = formatFollowers(track.followers);

  const glyph =
    playable || pending ? (
      <span className="row__play">
        <PlayGlyph playing={isCurrent && isPlaying} />
      </span>
    ) : null;

  const className = [
    'row',
    album ? 'row--album' : '',
    isCurrent ? 'row--current' : '', // esta sonando
    isOpen ? 'row--open' : '', // tiene la ficha desplegada
    isFocused ? 'row--focused' : '',
    // Pendiente no es lo mismo que sin preview: no debe verse apagada.
    playable || pending ? '' : 'row--dead',
    pending ? 'row--pending' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      ref={setNode}
      className={className}
      style={{ '--i': slot }}
      onClick={handleClick}
      onMouseEnter={handleEnter}
      aria-current={isCurrent ? 'true' : undefined}
      aria-expanded={isOpen}
    >
      {/* Zona de click a sangre: da foco de teclado sin anidar enlaces en un boton. */}
      <button
        type="button"
        className="row__hit"
        tabIndex={0}
        /* El manejador global de teclado ya cubre Espacio y Enter; sin esto el
           boton dispararia ademas su click nativo y la accion iria dos veces. */
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') event.preventDefault();
        }}
        aria-label={
          playable
            ? `Reproducir ${track.title} de ${track.artistLine}`
            : `Ver información de ${track.title} de ${track.artistLine} (sin preview disponible)`
        }
      />

      {/* Numeracion por posicion visible: al ordenar o filtrar, la lista debe
          leerse 01, 02, 03 y no saltar con los indices originales. En un album
          y sin tocar el orden coincide con el numero de pista del disco. */}
      <span className="row__index">
        <span className="row__num">{String(slot + 1).padStart(2, '0')}</span>
        {/* Sin portada donde ponerlo, el glifo se pinta aqui encima. */}
        {album ? glyph : null}
      </span>

      {album ? null : (
        <div className="row__art">
          {/* La fila colapsada mide ~48-64 px y la abierta llega a ~112. */}
          <Cover art={track.art} sizes="(max-width: 720px) 64px, 112px" />
          {glyph}
        </div>
      )}

      <div className="row__main">
        <h2 className="row__title">{track.title}</h2>
        <p className="row__artist">{track.artistLine}</p>
      </div>

      <span className="row__time">
        {isCurrent && isPlaying ? <EqBars playing /> : formatDuration(track.durationMs)}
      </span>

      {/* Ficha completa: solo la cancion que suena. */}
      <div className="row__reveal">
        <div>
          <div className="row__details">
            {/* En un album, decir el album en cada ficha es decir lo que ya
                pone el titulo de la pagina catorce veces. */}
            {track.album && !album ? (
              <span className="tag">
                <span className="tag--key">Álbum</span>
                {track.albumUrl ? (
                  <a
                    className="tag--link"
                    href={track.albumUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {track.album}
                  </a>
                ) : (
                  track.album
                )}
              </span>
            ) : null}

            {releaseLabel ? (
              <span className="tag">
                <span className="tag--key">Publicado</span>
                {releaseLabel}
              </span>
            ) : null}

            {track.genre ? (
              <span className="tag">
                <span className="tag--key">Género</span>
                {capitalize(track.genre)}
              </span>
            ) : null}

            {Number.isFinite(track.popularity) ? (
              <span className="tag" title={`Popularidad ${track.popularity}/100 segun Spotify`}>
                <span className="tag--key">Popularidad</span>
                <span className="meter">
                  <span
                    className="meter__fill"
                    style={{ transform: `scaleX(${track.popularity / 100})` }}
                  />
                </span>
              </span>
            ) : null}

            {followers ? (
              <span className="tag">
                <span className="tag--key">Oyentes</span>
                {followers}
              </span>
            ) : null}

            {track.trackNumber ? (
              <span className="tag">
                <span className="tag--key">Pista</span>
                {track.trackNumber}
                {track.albumTracks ? ` / ${track.albumTracks}` : ''}
              </span>
            ) : null}

            {track.explicit ? <span className="tag--badge">Explicit</span> : null}
            {!playable && !pending ? <span className="tag--badge">Sin preview</span> : null}

            {track.spotifyUrl ? (
              <a
                className="tag--link"
                href={track.spotifyUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                Abrir en Spotify
              </a>
            ) : null}
          </div>

          {/* Atada a isCurrent, JAMAS al foco: colgarla del hover fue el bug de
              la tanda anterior, porque todas las filas leian la posicion global
              del reproductor y parecian estar avanzando a la vez. */}
          {isOpen && isCurrent && playable ? (
            <Scrubber subscribePosition={subscribePosition} duration={duration} onSeek={onSeek} />
          ) : null}
        </div>
      </div>
    </li>
  );
}

/* Memo: sin la barra de progreso aqui, una fila solo se repinta cuando cambia
   su propio foco o deja de ser la que suena. */
export default memo(TrackRow);
