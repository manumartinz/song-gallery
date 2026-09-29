import { useEffect, useState } from 'react';
import EqBars from './EqBars.jsx';
import { cleanMoodQuery, MOOD_MAX } from '../lib/sources.js';

/* Ideas para quien no sabe qué escribir. Las primeras cuatro salen además como
   chips; todas pasan por el placeholder. */
const EXAMPLES = [
  'para manejar de noche',
  'domingo lluvioso',
  'pre-boliche',
  'para concentrarme',
  'tristecito pero bailable',
  'cocinando con amigos',
  'volver caminando a casa',
];
const ROTATE_MS = 3200;

/**
 * «¿Qué querés escuchar?»: una frase y la IA elige, entre mis canciones, las
 * que van con eso (ver api/mood.js).
 *
 * `onSearch` pide la selección y la abre como una fuente más: de ahí en
 * adelante se reproduce, se comparte y va a la URL como cualquier playlist.
 * `active` es la frase de la selección abierta, si hay una; `error`, lo que
 * salió mal al pedir la última.
 */
export default function MoodSearch({ active, busy, error, onSearch }) {
  const [value, setValue] = useState(active || '');
  const [hint, setHint] = useState(0);
  const [focused, setFocused] = useState(false);

  // Al abrir otra selección (o llegar con ?mood=) el campo muestra su frase.
  useEffect(() => {
    if (active) setValue(active);
  }, [active]);

  // El placeholder va cambiando mientras nadie escribe.
  useEffect(() => {
    if (focused || value) return undefined;
    const timer = setInterval(() => setHint((n) => (n + 1) % EXAMPLES.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [focused, value]);

  const search = (text) => {
    const q = cleanMoodQuery(text);
    if (!q || busy) return;
    setValue(q);
    onSearch(q);
  };

  return (
    <section className="mood" aria-label="Búsqueda por ánimo">
      <form
        className="mood__form"
        onSubmit={(event) => {
          event.preventDefault();
          search(value);
        }}
      >
        <span className="mood__spark" aria-hidden="true">
          ✦
        </span>
        <input
          type="text"
          className="mood__input"
          value={value}
          maxLength={MOOD_MAX}
          data-no-drag
          enterKeyHint="search"
          placeholder={`¿Qué querés escuchar? «${EXAMPLES[hint]}»`}
          aria-label="Contá qué querés escuchar y la IA elige canciones"
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') event.currentTarget.blur();
          }}
        />
        <button type="submit" className="mood__go" disabled={busy || !cleanMoodQuery(value)}>
          {busy ? (
            <>
              <EqBars playing />
              <span>Buscando…</span>
            </>
          ) : (
            'Elegí por mí'
          )}
        </button>
      </form>

      {error ? (
        <p className="mood__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mood__chips">
        {EXAMPLES.slice(0, 4).map((example) => (
          <button
            key={example}
            type="button"
            className={`chip${active === example ? ' chip--on' : ''}`}
            disabled={busy}
            onClick={() => search(example)}
          >
            {example}
          </button>
        ))}
        <span className="mood__by">con IA · entre mis canciones</span>
      </div>
    </section>
  );
}
