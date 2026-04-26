'use strict';

const Fastify = require('fastify');
const jwt = require('@fastify/jwt');
const cors = require('@fastify/cors');
const cookie = require('@fastify/cookie');
const path = require('path');
const fs = require('fs').promises;

const config = require('./config');
const authRoutes = require('./auth/routes');
const dayRoutes = require('./days/routes');
const conceptRoutes = require('./concepts/routes');
const analyticsRoutes = require('./analytics/routes');
const pushRoutes = require('./push/routes');

const app = Fastify({
  logger: config.nodeEnv !== 'test',
});

// Plugins
app.register(cors, { origin: true, credentials: true });
app.register(cookie);
app.register(jwt, { secret: config.jwt.secret });

// API Routes
app.register(authRoutes, { prefix: '' });
app.register(dayRoutes, { prefix: '' });
app.register(conceptRoutes, { prefix: '' });
app.register(analyticsRoutes, { prefix: '' });
app.register(pushRoutes, { prefix: '' });

// Healthcheck
app.get('/health', async () => ({ status: 'ok' }));

// Static files + SPA fallback
const staticRoot = path.join(__dirname, '../../coach-pwa/dist');

app.get('/', async (request, reply) => {
  const indexPath = path.join(staticRoot, 'index.html');
  const html = await fs.readFile(indexPath, 'utf8');
  return reply.header('Content-Type', 'text/html').send(html);
});

app.get('/*', async (request, reply) => {
  const url = request.url;
  if (url.startsWith('/api') || url.startsWith('/auth') || url.startsWith('/days') || url.startsWith('/concepts') || url.startsWith('/patterns') || url.startsWith('/push') || url.startsWith('/health')) {
    return reply.status(404).send({ error: 'Not found' });
  }
  let filePath = path.join(staticRoot, url);
  try {
    const stat = await fs.stat(filePath);
    if (stat.isFile()) {
      const ext = path.extname(filePath);
      const types = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      };
      if (types[ext]) reply.header('Content-Type', types[ext]);
      const data = await fs.readFile(filePath);
      return reply.send(data);
    }
  } catch {}
  const indexPath = path.join(staticRoot, 'index.html');
  const html = await fs.readFile(indexPath, 'utf8');
  return reply.header('Content-Type', 'text/html').send(html);
});

// Start
async function start() {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`Server running on port ${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = app;
