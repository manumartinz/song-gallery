import { useEffect, useRef, useState } from 'react';
import AddPlaylistForm from './AddPlaylistForm.jsx';
import useMediaQuery from '../hooks/useMediaQuery.js';
import isHardReload from '../lib/hardReload.js';

const HINT_KEY = 'song-gallery:nav-hint-seen';
const HINT_MS = 9000;

/**
 * Selector de fuente en movil: un desplegable en la barra de arriba.
 *
 * En ancho no pinta nada. Ahi las playlists y los albumes viven juntos en el
 * riel de la izquierda (`SourceRail`), con un switch para pasar de unas a
 * otros; tenerlas ademas como pestañas aqui arriba seria enseñar la misma lista
 * dos veces.
 *
 * En pantallas estrechas el riel no cabe —once rotulos en mayusculas son siete
 * lineas antes de la primera cancion— y las pestañas tampoco. Un desplegable
 * dice el nombre de lo que suena y enseña el resto entero al abrirlo, en dos
 * bloques: playlists y albumes.
 *
 * El corte es un ARBOL distinto, no el mismo marcado repintado, asi que se
 * decide en JS con `useMediaQuery` y no con una media query a secas. Es el
 * mismo 720 px que usa el riel: si no coincidieran quedaria una franja de
 * anchos sin selector en ninguna parte.
 *
 * `hint` es permiso, no orden: dice que la pagina esta en un momento apto para
 * enseñar el aviso de primera visita (hay playlist cargada y el splash ya no
 * esta). Si toca enseñarlo o no lo decide este componente, que es quien sabe
 * si ya se vio.
 */
export default function PlaylistMenu({
  entries,
  activeId,
  onSelect,
  albums = [],
  activeAlbumId = null,
  onSelectAlbum,
  adding,
  setAdding,
  onSubmit,
  onRemove,
  hint = false,
}) {
  const compact = useMediaQuery('(max-width: 720px)');
  const [open, setOpen] = useState(false);
  const [hintOn, setHintOn] = useState(false);
  const rootRef = useRef(null);

  /* El formulario tambien se abre desde fuera (el boton del estado vacio llama
     a setAdding). Vive dentro del desplegable, asi que hay que abrirlo o ese
     boton no haria nada visible. */
  useEffect(() => {
    if (adding && compact) setOpen(true);
  }, [adding, compact]);

  // Al volver a ancho de escritorio el desplegable no debe quedarse abierto.
  useEffect(() => {
    if (!compact) setOpen(false);
  }, [compact]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  /* Aviso de primera visita. El boton se lee como el rotulo de lo que se esta
     viendo, no como una eleccion, asi que hay quien nunca descubre que hay mas
     de una playlist. Esto lo señala una vez y se va solo.

     Solo en movil: en ancho este componente no pinta nada, y marcar la clave
     alli la gastaria sin que nadie llegase a ver el globo. El riel tiene el
     suyo propio.

     Se marca como visto al APARECER y no al cerrarse, por lo mismo que el
     splash: quien lo ignore tambien lo ha visto, y volver a sacarlo en cada
     visita seria una molestia. Con una sola cosa que elegir no hay aviso.

     Ctrl+Shift+R lo saca igualmente: es la forma de volver a verlo sin abrir
     el inspector a borrar la clave. */
  const choices = entries.length + albums.length;

  useEffect(() => {
    if (!hint || !compact || choices < 2) return undefined;

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
  }, [hint, compact, choices]);

  /* Cualquier gesto sobre el menu lo cancela: si ya lo esta usando, sobra
     explicarselo. El teclado no dispara `pointerdown`, de ahi el onClick del
     aspa. */
  useEffect(() => {
    if (!hintOn) return undefined;

    const node = rootRef.current;
    if (!node) return undefined;

    const dismiss = () => setHintOn(false);
    node.addEventListener('pointerdown', dismiss);
    return () => node.removeEventListener('pointerdown', dismiss);
  }, [hintOn, compact]);

  if (!compact) return null;

  const choose = (entry) => {
    onSelect(entry);
    setOpen(false);
  };

  const chooseAlbum = (id) => {
    onSelectAlbum(id);
    setOpen(false);
  };

  /* Lo que se esta oyendo, sea de la clase que sea: es lo que rotula el boton.
     Con un album abierto ninguna playlist esta activa, y decir "Playlists"
     mientras suena un disco es mentir sobre donde esta uno. */
  const activeAlbum = albums.find((album) => album.id === activeAlbumId);
  const activeEntry = entries.find((entry) => entry.id === activeId);
  const current = activeAlbum?.label || activeEntry?.label || 'Playlists';

  // Con el desplegable o el alta abiertos el aviso ya no pinta nada.
  const showHint = hintOn && !open && !adding;

  return (
    <nav className="menu menu--compact" ref={rootRef} aria-label="Playlists y álbumes">
      <button
        type="button"
        className={`menu__trigger${open ? ' menu__trigger--on' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="menu__current">{current}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="menu__panel">
          {/* Los encabezados solo cuando hay dos bloques que separar: con la
              lista de albumes vacia, poner "Playlists" encima de las playlists
              no dice nada que no diga ya el boton. */}
          {albums.length ? <p className="menu__section">Mis playlists favoritas</p> : null}

          {entries.map((entry) => {
            /* Las pegadas nacen sin nombre y lo reciben cuando contesta
               Spotify. Mientras tanto hace falta algo que poner. */
            const label = entry.label || 'Playlist';
            const on = entry.id === activeId;

            return (
              /* El aspa va HERMANA del boton, no dentro: un boton dentro de otro
                 es HTML invalido y el navegador desarma el marcado. */
              <span className="menu__item" key={entry.id}>
                <button
                  type="button"
                  className={`menu__tab${on ? ' menu__tab--on' : ''}`}
                  onClick={() => choose(entry)}
                  aria-current={on ? 'true' : undefined}
                >
                  <span className="menu__label">{label}</span>
                  {entry.custom ? <span className="menu__own">tuya</span> : null}
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
              </span>
            );
          })}

          <AddPlaylistForm
            adding={adding}
            setAdding={setAdding}
            onSubmit={onSubmit}
            onDone={() => setOpen(false)}
          />

          {albums.length ? (
            <>
              <p className="menu__section">Mis álbumes favoritos</p>
              {albums.map((album) => {
                const on = album.id === activeAlbumId;
                return (
                  <span className="menu__item" key={album.id}>
                    <button
                      type="button"
                      className={`menu__tab${on ? ' menu__tab--on' : ''}`}
                      onClick={() => chooseAlbum(album.id)}
                      aria-current={on ? 'true' : undefined}
                    >
                      <span className="menu__label">{album.label}</span>
                    </button>
                  </span>
                );
              })}
            </>
          ) : null}
        </div>
      ) : null}

      {showHint ? (
        <p className="menu__hint" role="status">
          {/* Si no hay albumes vuelve a hablar solo de lo que hay. */}
          {albums.length ? 'Tocá para cambiar de playlist o álbum' : 'Tocá para cambiar de playlist'}
          <button
            type="button"
            className="menu__hint-close"
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
