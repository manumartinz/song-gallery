import { useEffect, useRef, useState } from 'react';
import isHardReload from '../lib/hardReload.js';

const HINT_KEY = 'song-gallery:albums-hint-seen';
const NAV_HINT_KEY = 'song-gallery:nav-hint-seen'; // el del menu de playlists
const HINT_MS = 9000;

/**
 * Álbumes fijos: un rótulo y los nombres sueltos sobre el fondo, a media altura
 * del lado izquierdo.
 *
 * No hay caja ni portadas. Flota por encima del contenido en vez de empujarlo:
 * la página se ve igual que sin él y los nombres quedan en el margen, que es
 * sitio muerto en pantallas anchas. Por debajo del punto en que ese margen
 * desaparece pasa a ser una tira en el flujo, encima de la lista, porque
 * flotando taparía las canciones.
 *
 * Los nombres salen de `src/config/albums.js`, no de Spotify: son rótulos que
 * no cambian nunca, y pedirlos por red era una petición por visita para
 * escribir un texto que ya está en el repo. Es lo mismo que hace el menú de
 * playlists.
 */
export default function AlbumRail({ albums, activeId, onSelect, hint = false }) {
  const [hintOn, setHintOn] = useState(false);
  const rootRef = useRef(null);

  /* Si el aviso del menu de playlists va a salir en esta carga.

     Se lee en el PRIMER RENDER y no dentro del efecto a proposito: el menu vive
     antes que esto en el arbol, asi que su efecto corre primero y deja la clave
     ya escrita. Preguntando desde el efecto siempre parecia que ya se habia
     visto, y los dos globos salian juntos en la primera visita, que es justo lo
     que se queria evitar. */
  const [navHintPending] = useState(() => {
    try {
      return !localStorage.getItem(NAV_HINT_KEY);
    } catch {
      return false; // sin almacenamiento no hay forma de saberlo: que salga
    }
  });

  /* Aviso de primera visita, hermano del que enseña que hay varias playlists.
     Mismo trato: se marca como visto al APARECER y no al cerrarse —quien lo
     ignore también lo ha visto— y `Ctrl+Shift+R` lo devuelve, que es cómo se
     vuelve a ver sin abrir el inspector a borrar claves.

     `navHintPending` es lo que los ordena: si el de las playlists sale en esta
     misma carga, éste se calla y espera a la visita siguiente. Dos globos a la
     vez en la primera visita no explican el doble, molestan el doble. Con
     `Ctrl+Shift+R` salen los dos, que ahí se están pidiendo a propósito y cada
     uno cuelga de un sitio distinto de la pantalla. */
  useEffect(() => {
    if (!hint || !albums.length) return undefined;

    const forced = isHardReload();
    if (!forced && navHintPending) return undefined;

    try {
      if (!forced && localStorage.getItem(HINT_KEY)) return undefined;
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* modo privado: sale esta vez, y no hay donde recordar que salio */
    }

    setHintOn(true);
    const timer = setTimeout(() => setHintOn(false), HINT_MS);
    return () => clearTimeout(timer);
  }, [hint, albums.length, navHintPending]);

  /* Cualquier gesto sobre los rótulos lo cancela: si ya los está usando, sobra
     explicárselos. El teclado no dispara `pointerdown`, de ahí el onClick de
     la propia aspa. */
  useEffect(() => {
    if (!hintOn) return undefined;

    const node = rootRef.current;
    if (!node) return undefined;

    const dismiss = () => setHintOn(false);
    node.addEventListener('pointerdown', dismiss);
    return () => node.removeEventListener('pointerdown', dismiss);
  }, [hintOn]);

  if (!albums.length) return null;

  return (
    <nav className="rail" ref={rootRef} aria-label="Álbumes favoritos">
      <p className="rail__eyebrow">Álbumes favoritos</p>

      <ul className="rail__list">
        {albums.map((album) => {
          const on = album.id === activeId;
          return (
            <li key={album.id}>
              <button
                type="button"
                className={`rail__item${on ? ' rail__item--on' : ''}`}
                onClick={() => onSelect(album.id)}
                aria-current={on ? 'true' : undefined}
              >
                {album.label}
              </button>
            </li>
          );
        })}
      </ul>

      {hintOn ? (
        <p className="rail__hint" role="status">
          Estos son mis álbumes favoritos
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
