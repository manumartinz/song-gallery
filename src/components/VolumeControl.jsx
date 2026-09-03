/**
 * Mando de volumen de la barra superior.
 *
 * La barra esta siempre a la vista: es el mando de la casa, no un cajon, y
 * esconderla tras el hover la dejaba fuera de alcance justo donde mas hace
 * falta —en tactil, donde no hay hover que la despliegue—. El icono silencia y
 * ademas dice de un vistazo por donde anda el nivel.
 */
export default function VolumeControl({ volume, muted, onVolume, onToggleMute }) {
  const level = muted ? 0 : volume;
  const percent = Math.round(level * 100);

  return (
    <div className="vol">
      <button
        type="button"
        className="vol__btn"
        onClick={onToggleMute}
        aria-label={muted ? 'Activar el sonido' : 'Silenciar'}
        aria-pressed={muted}
        title={muted ? 'Silenciado' : `Volumen ${percent}%`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9.4h3.3L12 5.5v13L7.3 14.6H4z" />
          {level === 0 ? (
            <path d="M16 9.8l4.5 4.4M20.5 9.8L16 14.2" />
          ) : (
            <>
              <path d="M15.6 9.6a3.6 3.6 0 0 1 0 4.8" />
              {level > 0.5 ? <path d="M18.4 7.2a7.3 7.3 0 0 1 0 9.6" /> : null}
            </>
          )}
        </svg>
      </button>

      {/* Un <input type="range"> de verdad: trae teclado, arrastre y lectores de
          pantalla hechos, y el atajo global de la lista lo respeta porque ya
          esquiva todo lo que sea un input. */}
      <input
        type="range"
        className="vol__range"
        min="0"
        max="1"
        step="0.01"
        value={level}
        style={{ '--level': level }}
        onChange={(event) => onVolume(Number(event.target.value))}
        aria-label="Volumen"
        aria-valuetext={`${percent}%`}
      />
    </div>
  );
}
