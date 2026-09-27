/**
 * Aviso de fin: la ultima cancion de la fuente termino y no hay siguiente.
 *
 * Antes la pagina se quedaba en silencio sin decir nada, con el mini en pausa
 * como si alguien lo hubiera parado. Esto cuenta que se acabo y ofrece por
 * donde seguir: la siguiente fuente de la lista, la radio, o volver a empezar.
 */
export default function EndCard({ name, next, onNext, onRadio, onRestart, onClose }) {
  return (
    <div className="endcard" role="status">
      <button type="button" className="endcard__close" onClick={onClose} aria-label="Cerrar">
        &times;
      </button>
      <p className="endcard__title">
        Se terminó <strong>{name}</strong>
      </p>
      <div className="endcard__actions">
        {next ? (
          <button type="button" className="endcard__main" onClick={onNext}>
            Seguir con {next.label}
          </button>
        ) : null}
        <button type="button" onClick={onRadio}>
          Radio
        </button>
        <button type="button" onClick={onRestart}>
          Desde el principio
        </button>
      </div>
    </div>
  );
}
