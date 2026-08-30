/** Conmutador lista / cuadricula. */
export default function ViewToggle({ view, onChange }) {
  return (
    <div className="views" role="group" aria-label="Formato de vista">
      <button
        type="button"
        className={`views__btn${view === 'list' ? ' views__btn--on' : ''}`}
        onClick={() => onChange('list')}
        aria-pressed={view === 'list'}
        aria-label="Vista en lista"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1" y="2.5" width="14" height="1.6" rx="0.8" />
          <rect x="1" y="7.2" width="14" height="1.6" rx="0.8" />
          <rect x="1" y="11.9" width="14" height="1.6" rx="0.8" />
        </svg>
      </button>

      <button
        type="button"
        className={`views__btn${view === 'grid' ? ' views__btn--on' : ''}`}
        onClick={() => onChange('grid')}
        aria-pressed={view === 'grid'}
        aria-label="Vista en cuadrícula"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1" y="1" width="6" height="6" rx="1" />
          <rect x="9" y="1" width="6" height="6" rx="1" />
          <rect x="1" y="9" width="6" height="6" rx="1" />
          <rect x="9" y="9" width="6" height="6" rx="1" />
        </svg>
      </button>
    </div>
  );
}
