import { useEffect, useState } from 'react';
import { trackEvent } from '../lib/clarity.js';

/**
 * "Recomendame una": cierra el círculo que abre el splash. Allí la
 * recomendación es mía; al final de la lista, se le devuelve el turno a quien
 * llegó hasta acá.
 *
 * Pregunta primero si el servidor lo tiene encendido (necesita Redis): si no,
 * no pinta nada y el pie queda como estaba.
 */
export default function RecommendForm() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [error, setError] = useState(null);

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

  if (status === 'sent') {
    return (
      <p className="rec__thanks" role="status">
        Gracias. La voy a escuchar.
      </p>
    );
  }

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus('sending');
    setError(null);
    try {
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(form)),
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
    <form className="rec" onSubmit={submit}>
      <label className="rec__field rec__field--song">
        <span>Recomendame una canción</span>
        <input
          name="song"
          required
          minLength={3}
          maxLength={200}
          placeholder="Link de Spotify, YouTube… o «canción — artista»"
          autoComplete="off"
        />
      </label>
      <label className="rec__field">
        <span>Tu nombre (si querés)</span>
        <input name="name" maxLength={60} autoComplete="given-name" />
      </label>
      <label className="rec__field rec__field--wide">
        <span>Algo que quieras contarme (si querés)</span>
        <textarea name="message" maxLength={400} rows={2} />
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
      <button type="submit" className="foot__action rec__send" disabled={status === 'sending'}>
        {status === 'sending' ? 'Enviando…' : 'Enviar'}
      </button>
    </form>
  );
}
