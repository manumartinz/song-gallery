import { useEffect, useRef, useState } from 'react';

/**
 * El `+` para pegar una playlist por link, y el campo en que se convierte.
 *
 * Vive aparte porque lo usan dos sitios: el desplegable de movil y el riel de
 * la izquierda en ancho. Lleva siempre las clases `menu__*`: es el mismo control
 * en los dos, y el riel solo le retoca la colocacion.
 *
 * `adding` lo sostiene App y no este componente: el boton del estado vacio
 * tambien abre el alta, desde fuera.
 */
export default function AddPlaylistForm({ adding, setAdding, onSubmit, onDone }) {
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState(null);
  const inputRef = useRef(null);
  const formRef = useRef(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  /* El formulario solo se cerraba al enviar o con Escape, asi que se quedaba
     clavado abierto: no hay boton para desdecirse. Un click fuera lo cierra.

     En movil vive dentro del panel: si este se cierra, `formRef` ya no apunta a
     nada y el siguiente click de fuera tambien cancela el alta, que es justo lo
     que se quiere. */
  useEffect(() => {
    if (!adding) return undefined;

    const onPointerDown = (event) => {
      if (!formRef.current?.contains(event.target)) setAdding(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [adding, setAdding]);

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
    onDone?.();
  };

  if (!adding) {
    return (
      <button
        type="button"
        className="menu__add"
        onClick={() => setAdding(true)}
        aria-label="Añadir una playlist por link"
      >
        +
      </button>
    );
  }

  return (
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
  );
}
