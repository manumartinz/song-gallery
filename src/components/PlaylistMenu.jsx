import { useEffect, useRef, useState } from 'react';
import useMediaQuery from '../hooks/useMediaQuery.js';

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
 */
export default function PlaylistMenu({ entries, activeId, onSelect, adding, setAdding, onSubmit }) {
  const compact = useMediaQuery('(max-width: 720px)');
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const rootRef = useRef(null);

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

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
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
      {entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={`menu__tab${entry.id === activeId ? ' menu__tab--on' : ''}`}
          onClick={() => choose(entry)}
          aria-current={entry.id === activeId ? 'true' : undefined}
        >
          {entry.label}
        </button>
      ))}

      {adding ? (
        <form className="menu__form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="menu__input"
            type="text"
            value={value}
            data-no-drag
            placeholder="https://open.spotify.com/playlist/..."
            aria-label="Link de la playlist"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setAdding(false);
            }}
          />
          <button type="submit" className="menu__add" aria-label="Cargar playlist">
            &rarr;
          </button>
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

  if (!compact) {
    return (
      <nav className="menu" aria-label="Playlists">
        {options}
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
    </nav>
  );
}
