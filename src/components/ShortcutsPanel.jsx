import { useEffect, useRef } from 'react';

/* Una sola lista para el panel. Si se añade un atajo en App, va aqui tambien:
   un atajo que no se cuenta es un atajo que nadie usa. */
const SHORTCUTS = [
  ['Espacio', 'Reproducir o pausar'],
  ['↑ ↓  ·  j k', 'Moverse por la lista'],
  ['Enter', 'Reproducir la marcada'],
  ['← →', 'Atrasar o adelantar 5 s'],
  ['n  ·  p', 'Siguiente o anterior'],
  ['s', 'Una al azar'],
  ['/', 'Buscar'],
  ['+  −  ·  m', 'Volumen y silencio'],
  ['?', 'Esta ayuda'],
];

/**
 * Panel de atajos. Mismo lenguaje que el splash: fondo casi opaco, texto
 * centrado, sin caja. Se cierra con Escape, con `?` otra vez o tocando fuera.
 */
export default function ShortcutsPanel({ onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className="keys"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keys-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="keys__inner">
        <p id="keys-title" className="keys__title">
          Atajos de teclado
        </p>
        <dl className="keys__list">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={keys} className="keys__row">
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
        <button ref={closeRef} type="button" className="keys__close" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
