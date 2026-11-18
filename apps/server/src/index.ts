import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { config } from './config.js';
import { purgeExpiredSessions } from './db.js';
import { type AppVariables, csrfMiddleware } from './middleware/auth.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { citationRoutes } from './routes/citations.js';
import { projectRoutes } from './routes/projects.js';

const STATIC_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

const app = new Hono<{ Variables: AppVariables }>();

// Global security headers (FortiGate / Homelab hardening)
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

// CSRF protection on API routes
app.use('/api/*', csrfMiddleware);

app.get('/api/health', (c) =>
  c.json({
    status: 'ok',
    uptimeSec: Math.round(process.uptime()),
    rssMb: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
  })
);

app.get('/api/busytex/manifest', (c) => {
  const candidates = [
    path.join(config.webDistDir, 'core/busytex'),
    path.join(config.webPublicDir, 'core/busytex'),
  ];

  const foundDir = candidates.find(
    (dir) => fs.existsSync(dir) && fs.existsSync(path.join(dir, 'busytex_worker.js'))
  );

  if (!foundDir) {
    return c.json({
      available: false,
      basePath: '/core/busytex',
      preloadPackages: [],
      catalogPackages: [],
    });
  }

  const entries = fs.readdirSync(foundDir);
  const dataPairs = entries.filter(
    (name) =>
      name.endsWith('.js') &&
      !name.startsWith('busytex') &&
      !name.startsWith('biber') &&
      !['pdftex.js', 'xetex.js', 'luahbtex.js'].includes(name) &&
      entries.includes(name.replace(/\.js$/, '.data'))
  );

  // Preload basic TeX Live package first; expose all others in catalogDataPackages for on-demand loading
  const basicPkg =
    dataPairs.find((n) => n.includes('basic')) ??
    dataPairs.find((n) => n.includes('latex-recommended')) ??
    dataPairs[0];

  const preloadPackages = basicPkg ? [`/core/busytex/${basicPkg}`] : [];
  const catalogPackages = dataPairs
    .filter((n) => n !== basicPkg)
    .map((n) => `/core/busytex/${n}`);

  return c.json({
    available: true,
    basePath: '/core/busytex',
    preloadPackages,
    catalogPackages,
  });
});

app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/projects', projectRoutes);
app.route('/api/citations', citationRoutes);

app.all('/api/*', (c) => c.json({ error: 'Route API introuvable.' }, 404));

// Serve static SPA build (apps/web/dist) when built
app.get('*', (c) => {
  if (!fs.existsSync(config.webDistDir)) {
    return c.text(
      'Backend actif. Lance `npm run dev:web` en développement ou `npm run build` en production.',
      200
    );
  }

  const urlPath = decodeURIComponent(new URL(c.req.url).pathname);
  const safeRel = urlPath.replace(/^\/+/, '');
  const candidate = path.resolve(config.webDistDir, safeRel);

  if (
    safeRel &&
    ! path.relative(config.webDistDir, candidate).startsWith('..') &&
    fs.existsSync(candidate) &&
    fs.statSync(candidate).isFile()
  ) {
    const ext = path.extname(candidate).toLowerCase();
    const mime = STATIC_MIME[ext] ?? 'application/octet-stream';
    const isImmutable =
      urlPath.startsWith('/assets/') ||
      urlPath.startsWith('/core/') ||
      ext === '.wasm' ||
      ext === '.data';

    const stream = fs.createReadStream(candidate);
    return new Response(stream as unknown as BodyInit, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': isImmutable
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=0, must-revalidate',
      },
    });
  }

  const indexHtml = path.join(config.webDistDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    return new Response(fs.readFileSync(indexHtml), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  }

  return c.notFound();
});

// Periodic session cleanup every hour
setInterval(() => {
  try {
    purgeExpiredSessions();
  } catch {
    // Ignore cleanup errors
  }
}, 3600 * 1000).unref();

export { app };

if (process.env.NODE_ENV !== 'test') {
  serve(
    {
      fetch: app.fetch,
      port: config.port,
      hostname: config.host,
    },
    (info) => {
      console.log(
        `[SynTeX] Serveur actif sur http://${info.address}:${info.port} (connexion Google, ${config.adminEmails.length} admin(s), URL publique : ${config.publicUrl})`
      );
    }
  );
}
