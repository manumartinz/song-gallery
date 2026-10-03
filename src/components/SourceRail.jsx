import { useEffect, useRef, useState } from 'react';
import AddPlaylistForm from './AddPlaylistForm.jsx';
import useMediaQuery from '../hooks/useMediaQuery.js';

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
  mine = [],
  activeMineId = null,
  onSelectMine,
  activeKind,
  adding,
  setAdding,
  onSubmit,
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
  const rootRef = useRef(null);

  useEffect(() => {
    setTab(activeKind === 'album' && hasAlbums ? 'album' : 'playlist');
  }, [activeKind, hasAlbums]);

  /* El alta tambien se abre desde fuera (el boton del estado vacio). El campo
     vive en la cara de playlists, asi que hay que ir a ella o no se veria. */
  useEffect(() => {
    if (adding) setTab('playlist');
  }, [adding]);

  /* En la tira de una sola fila (anchos medios) el rotulo encendido puede
     quedar fuera, deslizado a la derecha: se trae a la vista al cambiar de
     fuente o de cara. `scrollLeft` y no scrollIntoView, que ademas moveria la
     pagina en vertical. En el riel flotante la lista no desliza y esto no hace
     nada. */
  useEffect(() => {
    const center = () => {
      const item = rootRef.current?.querySelector(
        '.rail__pane--on .rail__item--on, .rail__pane--on .rail__year--on',
      );
      const list = item?.closest('.rail__list');
      if (!item || !list || list.scrollWidth <= list.clientWidth) return;
      // Centrado. Sin animar: al cargar la pagina el deslizamiento se cortaba a medias.
      const itemBox = item.getBoundingClientRect();
      const listBox = list.getBoundingClientRect();
      const start = itemBox.left - listBox.left + list.scrollLeft;
      list.scrollLeft = Math.max(0, start - (list.clientWidth - itemBox.width) / 2);
    };
    center();
    /* Otra vez con la tipografia ya cargada: con la de reserva los rotulos son
       mas angostos y el centrado se quedaba corto. */
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) center();
    });
    return () => {
      cancelled = true;
    };
  }, [activeAlbumId, activePlaylistId, activeMineId, tab]);

  if (compact) return null;

  const showAlbums = hasAlbums && tab === 'album';
  const regular = entries.filter((entry) => !entry.recommend && !entry.wrapped);
  const together = entries.filter((entry) => entry.recommend);
  const wrapped = entries.filter((entry) => entry.wrapped);

  /* Las dos caras van montadas a la vez y apiladas en la misma celda: el riel
     mide lo que la mas alta y no cambia al alternar, asi que el switch no se
     mueve. La oculta queda `inert` —ni foco ni clicks— y se funde por CSS. */
  const paneProps = (on) => ({
    className: `rail__pane${on ? ' rail__pane--on' : ''}`,
    'aria-hidden': on ? undefined : true,
    inert: on ? undefined : '',
  });

  return (
    <nav className="rail" ref={rootRef} aria-label="Playlists y álbumes">
      {hasAlbums ? (
        <div className="rail__top">
          <div className="rail__switch" role="group" aria-label="Qué lista ver" data-tab={tab}>
            {/* La pastilla encendida es una sola pieza que se desliza de una cara
                a la otra, en vez de apagarse en un boton y encenderse en el otro. */}
            <span className="rail__switch-thumb" aria-hidden="true" />
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
        </div>
      ) : null}

      {/* El switch dice qué clase de cosa es; el rótulo de cada cara dice de
          quién son. Sin álbumes no hay switch, y el rótulo es lo único que
          queda encima. */}
      <div className="rail__panes">
        {hasAlbums ? (
          <div {...paneProps(showAlbums)}>
            <p className="rail__eyebrow">Álbumes que vengo escuchando</p>
            <ul className="rail__list">
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
          </div>
        ) : null}

        <div {...paneProps(!showAlbums)}>
          <p className="rail__eyebrow">Mis playlists favoritas</p>
          <ul className="rail__list">
            {/* Las de mi cuenta van primero y en el color de lo que suena: son
                lo más vivo de la lista, lo único que cambia sin que yo toque
                nada. En la MISMA lista y no en otra: en la tira de anchos
                medios cada lista es una fila, y una segunda la haría crecer. */}
            {mine.map((entry) => {
              const on = entry.id === activeMineId;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`rail__item rail__item--mine${on ? ' rail__item--on' : ''}`}
                    onClick={() => onSelectMine(entry.id)}
                    aria-current={on ? 'true' : undefined}
                  >
                    {entry.label}
                  </button>
                </li>
              );
            })}

            {regular.map((entry) => {
              /* Las pegadas nacen sin nombre y lo reciben cuando contesta
                 Spotify. Mientras tanto hace falta algo que poner. */
              const label = entry.label || 'Playlist';
              const on = entry.id === activePlaylistId;

              return (
                /* El aspa va HERMANA del boton, no dentro: un boton dentro de
                   otro es HTML invalido. */
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

            {/* La que arman quienes escuchan, aparte y al final: no es una
                selección mía como las de arriba. */}
            {together.map((entry) => {
              const on = entry.id === activePlaylistId;
              return (
                <li key={entry.id} className="rail__apart">
                  <button
                    type="button"
                    className={`rail__item${on ? ' rail__item--on' : ''}`}
                    onClick={() => onSelectPlaylist(entry.id)}
                    aria-current={on ? 'true' : undefined}
                  >
                    {entry.label}
                  </button>
                </li>
              );
            })}

            {/* Mis Wrapped, un chip por año, al final y aparte como la de
                arriba. Un solo <li> con todos dentro: en el riel flotante es un
                bloque con su rotulo, y en la tira sigue en la misma fila. */}
            {wrapped.length ? (
              <li className="rail__wrapped">
                <p className="rail__eyebrow rail__wrapped-title" id="rail-wrapped">
                  Mis Wrapped
                </p>
                <div className="rail__years" role="group" aria-labelledby="rail-wrapped">
                  {wrapped.map((entry) => {
                    const on = entry.id === activePlaylistId;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        className={`rail__year${on ? ' rail__year--on' : ''}`}
                        onClick={() => onSelectPlaylist(entry.id)}
                        aria-current={on ? 'true' : undefined}
                        aria-label={`Wrapped ${entry.label}`}
                      >
                        {entry.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </nav>
  );
}
