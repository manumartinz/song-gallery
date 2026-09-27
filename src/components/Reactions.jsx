/**
 * Los dos botones de reacción de una canción, con su cuenta.
 *
 * "No la conocía" es la que importa: es lo que esta web quiere provocar. El
 * corazón está porque es el gesto que todo el mundo espera encontrar.
 */
export default function Reactions({ id, counts, mine, onToggle, className = '' }) {
  const love = counts?.love || 0;
  const discovered = counts?.new || 0;
  const loved = mine.has(`${id}:love`);
  const isNew = mine.has(`${id}:new`);

  const stop = (event) => event.stopPropagation();

  return (
    <span className={`reactions ${className}`} onClick={stop}>
      <button
        type="button"
        className={`reaction${loved ? ' reaction--on' : ''}`}
        onClick={() => onToggle(id, 'love')}
        aria-pressed={loved}
        aria-label={`Me gustó${love ? ` (${love})` : ''}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
        </svg>
        {love ? <span>{love}</span> : null}
      </button>
      <button
        type="button"
        className={`reaction${isNew ? ' reaction--on' : ''}`}
        onClick={() => onToggle(id, 'new')}
        aria-pressed={isNew}
      >
        No la conocía
        {discovered ? <span className="reaction__count">{discovered}</span> : null}
      </button>
    </span>
  );
}
