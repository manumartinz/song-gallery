/**
 * Por qué está cada canción: una nota tuya que sale en su ficha, en la vista
 * "Ahora suena" y en la tarjeta para historias.
 *
 * La clave es el id de la pista en Spotify, el que va en el link de la canción
 * (open.spotify.com/track/<id>) y en el `?t=` de la URL de esta web cuando suena.
 * Da igual en qué playlist o álbum esté: la nota la acompaña a todas partes.
 *
 * Cortas. En la tarjeta para historias entran unas tres líneas, y la ficha es
 * una ficha, no una reseña. Las que no tengan nota se ven como siempre.
 */
export const NOTES = {
  // '2SjnvpedDUU0Ga69bxnoCa': 'La primera vez que la escuché fue en...',
};

/** La nota de una pista, o null. */
export function noteFor(trackId) {
  const note = trackId ? NOTES[trackId] : null;
  return typeof note === 'string' && note.trim() ? note.trim() : null;
}
