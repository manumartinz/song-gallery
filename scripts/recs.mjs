/**
 * npm run recs [cantidad]
 *
 * Las recomendaciones que me dejaron, de la más nueva a la más vieja. Lee las
 * credenciales del Redis de .env.local (en Vercel: `vercel env pull`).
 */
import fs from 'node:fs';

for (const name of ['.env.local', '.env']) {
  if (!fs.existsSync(name)) continue;
  for (const line of fs.readFileSync(name, 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0 && !line.trim().startsWith('#')) {
      const key = line.slice(0, eq).trim();
      if (!(key in process.env))
        process.env[key] = line
          .slice(eq + 1)
          .trim()
          .replace(/^["']|["']$/g, '');
    }
  }
}

const { kv, kvConfigured } = await import('../api/_kv.js');
if (!kvConfigured()) {
  console.error('Faltan KV_REST_API_URL y KV_REST_API_TOKEN en .env.local.');
  process.exit(1);
}

const count = Math.max(1, Number(process.argv[2]) || 50);
const list = (await kv('LRANGE', 'recs', '0', String(count - 1))) || [];
if (!list.length) console.log('Todavía no hay recomendaciones.');

for (const raw of list) {
  const rec = JSON.parse(raw);
  const when = new Date(rec.at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  console.log(`\n${when}${rec.name ? ` · ${rec.name}` : ''}`);
  console.log(`  ${rec.song}`);
  if (rec.message) console.log(`  “${rec.message}”`);
}
