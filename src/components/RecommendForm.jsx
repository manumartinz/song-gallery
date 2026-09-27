import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { trackEvent } from '../lib/clarity.js';

/**
 * "Recomendame una": cierra el círculo que abre el splash. Allí la
 * recomendación es mía; al final de la lista, se le devuelve el turno a quien
 * llegó hasta acá.
 *
 * En el pie hay solo un botón; el formulario sale en un modal cuando alguien
 * lo pide. Tres campos a la vista en el pie pesaban más que la propia nota que
 * invita a usarlos.
 *
 * Pregunta primero si el servidor lo tiene encendido (necesita Redis): si no,
 * no pinta nada y el pie queda como estaba.
 *
 * `className` y `children` cambian el botón y no el formulario: el pie lo
 * pinta a su manera y la cabecera de la playlist de recomendaciones, como una
 * pastilla más al lado de "Al azar".
 */
export default function Recommend({
  className = 'foot__action rec__open',
  children = 'Recomendame una canción',
}) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/recommend')
      .then((response) => {
        if (!cancelled) setEnabled(response.status === 200);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          trackEvent('recommend_open');
          setOpen(true);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 18V6l10-2v12" />
          <circle cx="6.5" cy="18" r="2.5" />
          <circle cx="16.5" cy="16" r="2.5" />
        </svg>
        <span>{children}</span>
      </button>
      {/* En un portal: dentro del pie quedaria atrapado en el contexto de apilamiento
          de la pagina, por debajo de la barra de arriba. */}
      {open ? createPortal(<RecommendModal onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}

function RecommendModal({ onClose }) {
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState(null);
  const firstRef = useRef(null);
  // Cuándo se abrió: el servidor descarta envíos más rápidos que una persona.
  const openedAt = useRef(Date.now());
  const doneRef = useRef(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    document.body.classList.add('is-modal');
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.body.classList.remove('is-modal');
    };
  }, [onClose]);

  useEffect(() => {
    if (status === 'sent') doneRef.current?.focus();
  }, [status]);

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus('sending');
    setError(null);
    try {
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...Object.fromEntries(form),
          elapsed: Date.now() - openedAt.current,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'No se pudo enviar.');
      trackEvent('recommend');
      setStatus('sent');
    } catch (cause) {
      setError(cause.message);
      setStatus('error');
    }
  };

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rec-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal__card">
        <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
          &times;
        </button>

        {status === 'sent' ? (
          <div className="rec__done" role="status">
            <h2 id="rec-title" className="modal__title">
              Gracias
            </h2>
            <p className="modal__text">La voy a escuchar.</p>
            <button ref={doneRef} type="button" className="play-all" onClick={onClose}>
              Volver
            </button>
          </div>
        ) : (
          <>
            <form className="rec" onSubmit={submit}>
              <label className="rec__field rec__field--wide rec__field--lead">
                {/* El modal no lleva titulo, solo la X: esta etiqueta es lo que
                    anuncia el lector de pantalla. */}
                <span id="rec-title">
                  Recomendame una canción que te guste, que tengas dando vueltas o que simplemente
                  pienses que me puede gustar
                </span>
                <input
                  ref={firstRef}
                  name="song"
                  required
                  minLength={3}
                  maxLength={200}
                  placeholder="Link de Spotify, YouTube… o «canción — artista»"
                  autoComplete="off"
                />
              </label>
              <label className="rec__field rec__field--wide">
                <span>Tu nombre (así sé quién sos)</span>
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={60}
                  autoComplete="given-name"
                />
              </label>
              <label className="rec__field rec__field--wide">
                <span>Algo que quieras contarme (si querés)</span>
                <textarea name="message" maxLength={400} rows={3} />
              </label>
              {/* Trampa para bots: invisible para las personas. */}
              <input
                className="rec__trap"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />
              {error ? (
                <p className="rec__error" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="play-all rec__send" disabled={status === 'sending'}>
                {status === 'sending' ? 'Enviando…' : 'Enviar'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
