/**
 * El aviso de `useToast`. Va en una region viva para que el lector de pantalla
 * lo lea sin mover el foco.
 */
export default function Toast({ toast }) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast ? (
        <p key={toast.id} className="toast">
          {toast.text}
        </p>
      ) : null}
    </div>
  );
}
