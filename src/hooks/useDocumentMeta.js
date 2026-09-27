import { useEffect } from 'react';
import { paramFor } from '../lib/sources.js';

const SITE_TITLE = 'Música · Manu A. Martínez';

function setMeta(selector, attr, value) {
  const node = document.head.querySelector(selector);
  if (node && value) node.setAttribute(attr, value);
}

/**
 * Título, descripción y canónica de la fuente abierta.
 *
 * Para la pestaña (dice qué playlist está abierta en vez de lo mismo siempre)
 * y para los buscadores que sí ejecutan JavaScript, que leen el documento ya
 * pintado. La canónica va sin `?t=`: la canción que suena es un estado de la
 * página, no otra página.
 */
export default function useDocumentMeta({ kind, id, data }) {
  const name = data?.name;
  const owner = data?.owner;
  const description = data?.description;

  useEffect(() => {
    if (!id || !name) return;

    const isAlbum = kind === 'album';
    document.title = `${name} · ${SITE_TITLE}`;

    const text = isAlbum
      ? `${name}${owner ? `, de ${owner}` : ''}: uno de mis discos favoritos. Escuchalo acá, en fragmentos.`
      : description
        ? `«${name}»: ${description}`
        : `«${name}», una playlist de Manu A. Martínez. Escuchala acá, en fragmentos.`;
    setMeta('meta[name="description"]', 'content', text);

    const canonical = new URL('/', location.origin);
    canonical.searchParams.set(paramFor(kind), id);
    setMeta('link[rel="canonical"]', 'href', canonical.toString());
  }, [kind, id, name, owner, description]);
}
