import { useEffect, useRef, useState } from 'react';
import useMediaQuery from '../hooks/useMediaQuery.js';
import isHardReload from '../lib/hardReload.js';

const HINT_KEY = 'song-gallery:nav-hint-seen';
const HINT_MS = 9000;

/**
 * Selector de playlist: pestañas en escritorio, desplegable en movil.
 *
 * En pantallas estrechas las pestañas no caben. Antes se resolvia con una tira
 * de 58vw con scroll horizontal, y era mal invento: no se veia cuantas
 * playlists habia, ni cual estaba activa si quedaba fuera del recorte, y
 * competia con el arrastre de la lista. Un desplegable dice el nombre de la
 * activa y enseña el resto entero al abrirlo.
 *
 * El corte es un ARBOL distinto, no el mismo marcado repintado, asi que se
 * decide en JS con `useMediaQuery` y no con una media query a secas.
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
  adding,
  setAdding,
  onSubmit,
  onRemove,
  hint = false,
}) {
  const compact = useMediaQuery('(max-width: 720px)');
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState(null);
  const [hintOn, setHintOn] = useState(false);
  const inputRef = useRef(null);
  const rootRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  /* El formulario tambien se abre desde fuera (el boton del estado vacio llama
     a setAdding). En movil vive dentro del desplegable, asi que hay que abrirlo
     o ese boton no haria nada visible. */
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

  /* El formulario solo se cerraba al enviar o con Escape, asi que en escritorio
     se quedaba clavado abierto: no hay boton para desdecirse. Un click fuera lo
     cierra, igual que el desplegable.

     En movil el formulario vive dentro del panel: si este se cierra, `formRef`
     ya no apunta a nada y el siguiente click de fuera tambien cancela el alta,
     que es justo lo que se quiere. */
  useEffect(() => {
    if (!adding) return undefined;

    const onPointerDown = (event) => {
      if (!formRef.current?.contains(event.target)) setAdding(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [adding, setAdding]);

  /* Aviso de primera visita. Las pestañas se leen como el rotulo de lo que se
     esta viendo, no como una eleccion, asi que hay quien nunca descubre que hay
     mas de una playlist. Esto lo señala una vez y se va solo.

     Se marca como visto al APARECER y no al cerrarse, por lo mismo que el
     splash: quien lo ignore tambien lo ha visto, y volver a sacarlo en cada
     visita seria una molestia. Con una sola playlist no hay nada que elegir.

     Ctrl+Shift+R lo saca igualmente: es la forma de volver a verlo sin abrir
     el inspector a borrar la clave. Un visitante normal nunca fuerza una
     recarga, asi que en la practica esto solo lo nota quien lo busca. */
  useEffect(() => {
    if (!hint || entries.length < 2) return undefined;

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
  }, [hint, entries.length]);

  /* Cualquier gesto sobre el menu lo cancela: si ya lo esta usando, sobra
     explicarselo. Un unico listener en el <nav> cubre pestañas, "+",
     desplegable y el aspa, porque todo cuelga de ahi. El teclado no dispara
     `pointerdown`, de ahi el onClick del aspa. */
  useEffect(() => {
    if (!hintOn) return undefined;

    const node = rootRef.current;
    if (!node) return undefined;

    const dismiss = () => setHintOn(false);
    node.addEventListener('pointerdown', dismiss);
    return () => node.removeEventListener('pointerdown', dismiss);
  }, [hintOn, compact]);

  // Al cerrar el alta no debe quedar un aviso esperando a la proxima apertura.
  useEffect(() => {
    if (!adding) setProblem(null);
  }, [adding]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    /* onSubmit devuelve el motivo del rechazo, o null si entro. Se queda aqui,
       junto al campo donde se ha pegado el link: el aviso global sustituye la
       pagina entera y te borraria de la pantalla lo que estabas escuchando. */
    const reason = onSubmit(trimmed);
    if (reason) {
      setProblem(reason);
      return;
    }

    setValue('');
    setAdding(false);
    setOpen(false);
  };

  const choose = (entry) => {
    onSelect(entry);
    setOpen(false);
  };

  // Mismo contenido en los dos modos: solo cambia el envoltorio.
  const options = (
    <>
      {entries.map((entry) => {
        /* Las pegadas nacen sin nombre y lo reciben cuando contesta Spotify.
           Mientras tanto hace falta algo que poner en la pestaña. */
        const label = entry.label || 'Playlist';

        return (
          /* El aspa va HERMANA del boton, no dentro: un boton dentro de otro es
             HTML invalido y el navegador desarma el marcado. De ahi el
             envoltorio. */
          <span className="menu__item" key={entry.id}>
            <button
              type="button"
              className={`menu__tab${entry.id === activeId ? ' menu__tab--on' : ''}`}
              onClick={() => choose(entry)}
              aria-current={entry.id === activeId ? 'true' : undefined}
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

      {adding ? (
        <form className="menu__form" ref={formRef} onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="menu__input"
            type="text"
            value={value}
            data-no-drag
            placeholder="https://open.spotify.com/playlist/..."
            aria-label="Link de la playlist"
            onChange={(event) => {
              setValue(event.target.value);
              setProblem(null); // corregir el link no debe seguir con la queja puesta
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setAdding(false);
            }}
          />
          <button type="submit" className="menu__add" aria-label="Cargar playlist">
            &rarr;
          </button>
          {problem ? (
            <p className="menu__error" role="alert">
              {problem}
            </p>
          ) : null}
        </form>
      ) : (
        <button
          type="button"
          className="menu__add"
          onClick={() => setAdding(true)}
          aria-label="Añadir una playlist por link"
        >
          +
        </button>
      )}
    </>
  );

  /* Con el desplegable o el alta abiertos el aviso ya no pinta nada, y ademas
     le taparia el panel. */
  const showHint = hint && hintOn && !open && !adding;

  const hintNode = (
    <p className="menu__hint" role="status">
      {compact ? 'Tocá para cambiar de playlist' : 'Son playlists: elegí la que quieras'}
      <button
        type="button"
        className="menu__hint-close"
        onClick={() => setHintOn(false)}
        aria-label="Entendido"
      >
        &times;
      </button>
    </p>
  );

  if (!compact) {
    return (
      <nav className="menu" ref={rootRef} aria-label="Playlists">
        {options}
        {showHint ? hintNode : null}
      </nav>
    );
  }

  const active = entries.find((entry) => entry.id === activeId);

  return (
    <nav className="menu menu--compact" ref={rootRef} aria-label="Playlists">
      <button
        type="button"
        className={`menu__trigger${open ? ' menu__trigger--on' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="menu__current">{active ? active.label : 'Playlists'}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>

      {open ? <div className="menu__panel">{options}</div> : null}
      {showHint ? hintNode : null}
    </nav>
  );
}
