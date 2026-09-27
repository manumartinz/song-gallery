/**
 * Una línea JSON por error, para poder filtrarlos en los logs de Vercel (y
 * montar una alerta sobre `level:error`) en vez de leer trazas sueltas.
 *
 * Los 404 no son errores nuestros —un link mal copiado, una playlist
 * privada— y van como aviso, para que no ahoguen a los de verdad.
 */
export function logError(route, error, context = {}) {
  const status = Number(error?.status) || 500;
  const line = {
    level: status >= 500 ? 'error' : 'warn',
    route,
    status,
    message: error?.message || String(error),
    ...context,
  };
  (status >= 500 ? console.error : console.warn)(JSON.stringify(line));
}
