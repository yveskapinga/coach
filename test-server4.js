require('dotenv').config();
const path = require('path');
const Fastify = require('fastify');
const jwt = require('@fastify/jwt');
const cors = require('@fastify/cors');
const cookie = require('@fastify/cookie');

const config = require('./src/config');
const authRoutes = require('./src/auth/routes');
const dayRoutes = require('./src/days/routes');
const conceptRoutes = require('./src/concepts/routes');
const analyticsRoutes = require('./src/analytics/routes');
const pushRoutes = require('./src/push/routes');

const app = Fastify({ logger: false });

app.register(cors, { origin: true, credentials: true });
app.register(cookie);
app.register(jwt, { secret: config.jwt.secret });

app.register(authRoutes, { prefix: '' });
app.register(dayRoutes, { prefix: '' });
app.register(conceptRoutes, { prefix: '' });
app.register(analyticsRoutes, { prefix: '' });
app.register(pushRoutes, { prefix: '' });

app.get('/health', async () => ({ status: 'ok' }));

const staticRoot = path.join(__dirname, '../coach-pwa/dist');

app.get('/', async (request, reply) => {
  const html = require('fs').readFileSync(path.join(staticRoot, 'index.html'), 'utf8');
  return reply.header('Content-Type', 'text/html').send(html);
});

app.get('/*', async (request, reply) => {
  const html = require('fs').readFileSync(path.join(staticRoot, 'index.html'), 'utf8');
  return reply.header('Content-Type', 'text/html').send(html);
});

app.listen({ port: 3002, host: '127.0.0.1' }).then(() => {
  console.log('test server on 3002');
});
