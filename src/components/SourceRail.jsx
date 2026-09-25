import { useEffect, useRef, useState } from 'react';
import AddPlaylistForm from './AddPlaylistForm.jsx';
import useMediaQuery from '../hooks/useMediaQuery.js';
import isHardReload from '../lib/hardReload.js';

const HINT_KEY = 'song-gallery:rail-hint-seen';
const HINT_MS = 9000;

/**
 * Playlists y álbumes favoritos, juntos a media altura del lado izquierdo, con
 * un switch arriba para pasar de una lista a la otra.
 *
 * No hay caja ni portadas. Flota por encima del contenido en vez de empujarlo:
 * la página se ve igual que sin él y los nombres quedan en el margen, que es
 * sitio muerto en pantallas anchas. Por debajo del punto en que ese margen
 * desaparece pasa a ser una tira en el flujo, encima de la lista, porque
 * flotando taparía las canciones.
 *
 * Las dos listas no van a la vez: una debajo de otra serían veinte rótulos,
 * más de lo que cabe centrado a lo alto en un portátil bajo. El switch enseña
 * una y deja la otra a un click.
 *
 * Los nombres de los álbumes salen de `src/config/albums.js`, no de Spotify:
 * son rótulos que no cambian nunca. Las playlists son las de `entries`, las del
 * repo y las que pega el visitante, con su `tuya`, su aspa y el `+` al final.
 */
export default function SourceRail({
  entries,
  activePlaylistId,
  onSelectPlaylist,
  onRemove,
  albums,
  activeAlbumId,
  onSelectAlbum,
  activeKind,
  adding,
  setAdding,
  onSubmit,
  hint = false,
}) {
  /* En movil esto no se pinta: las dos listas viven dentro del desplegable de
     la barra. El corte es el MISMO 720 px con el que el menu se vuelve
     desplegable, y por eso se decide en JS: si no coincidieran quedaria una
     franja de anchos sin selector en ninguna parte. */
  const compact = useMediaQuery('(max-width: 720px)');
  const hasAlbums = albums.length > 0;

  /* Qué lista se enseña. Arranca en la de lo que suena, y la sigue cuando la
     fuente cambia de clase por su cuenta (quitar la playlist pegada que sonaba
     te devuelve a una playlist aunque estuvieras mirando los álbumes). */
  const [tab, setTab] = useState(activeKind === 'album' && hasAlbums ? 'album' : 'playlist');
  const [hintOn, setHintOn] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    setTab(activeKind === 'album' && hasAlbums ? 'album' : 'playlist');
  }, [activeKind, hasAlbums]);

  /* El alta tambien se abre desde fuera (el boton del estado vacio). El campo
     vive en la cara de playlists, asi que hay que ir a ella o no se veria. */
  useEffect(() => {
    if (adding) setTab('playlist');
  }, [adding]);

  /* Aviso de primera visita: señala que hay dos listas y que el switch las
     alterna. Se marca como visto al APARECER y no al cerrarse —quien lo ignore
     también lo ha visto— y `Ctrl+Shift+R` lo devuelve, que es cómo se vuelve a
     ver sin abrir el inspector a borrar claves.

     No choca con el del desplegable: aquel es solo de móvil y éste solo de
     ancho, así que nunca salen los dos en la misma pantalla. */
  useEffect(() => {
    if (!hint || !hasAlbums || compact) return undefined;

    const forced = isHardReload();

    try {
      if (!forced && localStorage.getItem(HINT_KEY)) return undefined;
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* modo privado: sale esta vez, y no hay donde recordar que salio */
    }

    setHintOn(true);
    const timer = setTimeout(() => setHintOn(false), HINT_MS);
    return () => clearTimeout(timer);
  }, [hint, hasAlbums, compact]);

  /* Cualquier gesto sobre el riel lo cancela: si ya lo está usando, sobra
     explicárselo. El teclado no dispara `pointerdown`, de ahí el onClick de
     la propia aspa. */
  useEffect(() => {
    if (!hintOn) return undefined;

    const node = rootRef.current;
    if (!node) return undefined;

    const dismiss = () => setHintOn(false);
    node.addEventListener('pointerdown', dismiss);
    return () => node.removeEventListener('pointerdown', dismiss);
  }, [hintOn]);

  if (compact) return null;

  const showAlbums = hasAlbums && tab === 'album';

  return (
    <nav className="rail" ref={rootRef} aria-label="Playlists y álbumes">
      {hasAlbums ? (
        <div className="rail__switch" role="group" aria-label="Qué lista ver">
          {[
            ['playlist', 'Playlists'],
            ['album', 'Álbumes'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`rail__switch-btn${tab === key ? ' rail__switch-btn--on' : ''}`}
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {/* El switch dice qué clase de cosa es; esto dice de quién son. Sin
          álbumes no hay switch, y el rótulo es lo único que queda encima. */}
      <p className="rail__eyebrow">
        {showAlbums ? 'Mis álbumes favoritos' : 'Mis playlists favoritas'}
      </p>

      {showAlbums ? (
        <ul className="rail__list" key="album">
          {albums.map((album) => {
            const on = album.id === activeAlbumId;
            return (
              <li key={album.id}>
                <button
                  type="button"
                  className={`rail__item${on ? ' rail__item--on' : ''}`}
                  onClick={() => onSelectAlbum(album.id)}
                  aria-current={on ? 'true' : undefined}
                >
                  {album.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="rail__list" key="playlist">
          {entries.map((entry) => {
            /* Las pegadas nacen sin nombre y lo reciben cuando contesta
               Spotify. Mientras tanto hace falta algo que poner. */
            const label = entry.label || 'Playlist';
            const on = entry.id === activePlaylistId;

            return (
              /* El aspa va HERMANA del boton, no dentro: un boton dentro de otro
                 es HTML invalido. */
              <li key={entry.id} className="rail__row">
                <button
                  type="button"
                  className={`rail__item${on ? ' rail__item--on' : ''}`}
                  onClick={() => onSelectPlaylist(entry.id)}
                  aria-current={on ? 'true' : undefined}
                >
                  {label}
                  {entry.custom ? <span className="menu__own"> tuya</span> : null}
                </button>

                {entry.custom ? (
                  <button
                    type="button"
                    className="menu__drop"
                    onClick={() => onRemove(entry.id)}
                    aria-label={`Quitar ${label}`}
                  >
                    &times;
                  </button>
                ) : null}
              </li>
            );
          })}

          <li className="rail__add">
            <AddPlaylistForm adding={adding} setAdding={setAdding} onSubmit={onSubmit} />
          </li>
        </ul>
      )}

      {hintOn ? (
        <p className="rail__hint" role="status">
          Cambiá entre playlists y álbumes
          <button
            type="button"
            className="rail__hint-close"
            onClick={() => setHintOn(false)}
            aria-label="Entendido"
          >
            &times;
          </button>
        </p>
      ) : null}
    </nav>
  );
}
