/** Formateadores de presentacion. Todos toleran null/undefined. */

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--:--';
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatSeconds(seconds) {
  return formatDuration(Number.isFinite(seconds) ? seconds * 1000 : NaN);
}

/** "2019-04-05" -> "5 abr 2019". Con solo el año devuelve el año. */
export function formatReleaseDate(value) {
  if (!value) return null;
  if (value.length === 4) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatFollowers(count) {
  if (!Number.isFinite(count)) return null;
  return new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 }).format(count);
}

/** Primera letra en mayuscula: los generos de Spotify llegan en minusculas. */
export function capitalize(text) {
  if (!text) return null;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
