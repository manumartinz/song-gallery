/**
 * Plugin de Vite para lo que los buscadores leen sin ejecutar JavaScript.
 *
 * Todo sale de la config del repo (playlists y álbumes), así que no hay una
 * segunda lista que mantener:
 *
 *  - En el HTML: datos estructurados (JSON-LD) de la web, de quién la hace y
 *    de sus playlists y discos, y un <noscript> con enlaces a cada uno. Es lo
 *    único con contenido real que ve quien no ejecuta JS; a una persona con JS
 *    no le cambia nada.
 *  - En el build: sitemap.xml con la portada y cada playlist y disco, y
 *    robots.txt apuntando a él. /api queda fuera (no son páginas), salvo las
 *    imágenes de las tarjetas.
 */
import { ALBUM_ENTRIES, FIXED_ENTRIES } from './src/lib/sources.js';

export const SITE = 'https://music.manuelmartinez.ar';
const NAME = 'Manu A. Martínez';
const DESCRIPTION =
  'Canciones que recomiendo. No es un reproductor: es una selección mía, en fragmentos.';
const SAME_AS = [
  'https://www.instagram.com/manumartinezx/',
  'https://open.spotify.com/user/manumartinez6',
];

function pages() {
  return [
    ...FIXED_ENTRIES.map((entry) => ({
      type: 'MusicPlaylist',
      name: entry.label,
      url: `${SITE}/?p=${entry.id}`,
    })),
    ...ALBUM_ENTRIES.map((album) => ({
      type: 'MusicAlbum',
      name: album.label,
      url: `${SITE}/?a=${album.id}`,
    })),
  ];
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function jsonLd() {
  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#web`,
      url: `${SITE}/`,
      name: `Música · ${NAME}`,
      description: DESCRIPTION,
      inLanguage: 'es-AR',
      author: { '@id': `${SITE}/#autor` },
    },
    {
      '@type': 'Person',
      '@id': `${SITE}/#autor`,
      name: NAME,
      url: `${SITE}/`,
      sameAs: SAME_AS,
    },
    {
      '@type': 'ItemList',
      name: 'Mis playlists y discos favoritos',
      itemListElement: pages().map((page, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: { '@type': page.type, name: page.name, url: page.url },
      })),
    },
  ];
  // `<` escapado: un nombre con "</script>" no puede cerrar la etiqueta.
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(
    /</g,
    '\\u003c',
  );
}

function noscript() {
  const items = (type) =>
    pages()
      .filter((page) => page.type === type)
      .map((page) => `<li><a href="${page.url}">${escapeHtml(page.name)}</a></li>`)
      .join('');
  return `<noscript>
      <main class="noscript">
        <h1>Música · ${NAME}</h1>
        <p>${DESCRIPTION} Para escucharlas hace falta JavaScript.</p>
        <h2>Mis playlists favoritas</h2>
        <ul>${items('MusicPlaylist')}</ul>
        <h2>Mis álbumes favoritos</h2>
        <ul>${items('MusicAlbum')}</ul>
      </main>
    </noscript>`;
}

export function sitemap(lastmod = new Date().toISOString().slice(0, 10)) {
  const urls = [
    { url: `${SITE}/`, priority: '1.0' },
    ...pages().map((page) => ({ url: page.url, priority: '0.8' })),
  ];
  const body = urls
    .map(
      ({ url, priority }) =>
        `  <url><loc>${url.replace(/&/g, '&amp;')}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function robots() {
  /* Las imagenes de las tarjetas si: las piden los rastreadores al armar la
     vista previa de un enlace. */
  return `User-agent: *\nAllow: /\nAllow: /api/og\nAllow: /api/story\nDisallow: /api/\nDisallow: /admin\n\nSitemap: ${SITE}/sitemap.xml\n`;
}

export default function seo() {
  return {
    name: 'song-gallery-seo',
    transformIndexHtml(html, ctx) {
      // Solo la galería: el panel no tiene nada que contarle a un buscador.
      if (/admin\.html$/.test(ctx?.filename || ctx?.path || '')) return html;
      return html
        .replace(
          '</head>',
          `    <script type="application/ld+json">${jsonLd()}</script>\n  </head>`,
        )
        .replace('<div id="root"></div>', `<div id="root"></div>\n    ${noscript()}`);
    },
    // En desarrollo tambien, para poder mirarlos.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const files = {
          '/sitemap.xml': ['application/xml', sitemap],
          '/robots.txt': ['text/plain', robots],
        };
        const file = files[req.url];
        if (!file) return next();
        res.setHeader('Content-Type', `${file[0]}; charset=utf-8`);
        res.end(file[1]());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap() });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots() });
    },
  };
}
