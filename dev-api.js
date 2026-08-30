/**
 * Plugin de Vite que sirve las funciones de /api durante `npm run dev`.
 *
 * En produccion Vercel ejecuta cada archivo de /api como una funcion serverless.
 * Este plugin replica ese contrato en local (req.query, res.status().json())
 * para no depender de `vercel dev`. Solo actua en desarrollo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Carga .env.local y .env en process.env sin pisar variables ya definidas. */
function loadEnvFiles(root) {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    for (const rawLine of fs.readFileSync(file, 'utf8').split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

export default function devApi() {
  const moduleCache = new Map(); // file -> { mtimeMs, mod }

  return {
    name: 'song-gallery-dev-api',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root;
      loadEnvFiles(root);

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();

        const url = new URL(req.url, 'http://localhost');
        const route = url.pathname.slice('/api/'.length).replace(/\.js$/, '');
        const file = path.join(root, 'api', `${route}.js`);

        // Impide salir del directorio api/ con ../
        if (!file.startsWith(path.join(root, 'api')) || !fs.existsSync(file)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: `No existe la ruta /api/${route}` }));
          return;
        }

        try {
          // Reimporta solo si el archivo cambio, para conservar el token cacheado.
          const { mtimeMs } = fs.statSync(file);
          const cached = moduleCache.get(file);
          let mod = cached && cached.mtimeMs === mtimeMs ? cached.mod : null;
          if (!mod) {
            mod = await import(`${pathToFileURL(file).href}?t=${mtimeMs}`);
            moduleCache.set(file, { mtimeMs, mod });
          }

          req.query = Object.fromEntries(url.searchParams);
          res.status = (code) => {
            res.statusCode = code;
            return res;
          };
          res.json = (body) => {
            if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(body));
            return res;
          };

          await mod.default(req, res);
        } catch (error) {
          server.config.logger.error(`[dev-api] ${route}: ${error.stack || error.message}`);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: error.message }));
          }
        }
      });
    },
  };
}
