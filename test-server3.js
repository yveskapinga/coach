require('dotenv').config();
const path = require('path');
const Fastify = require('fastify');
const jwt = require('@fastify/jwt');
const cors = require('@fastify/cors');
const cookie = require('@fastify/cookie');
const staticPlugin = require('@fastify/static');

const config = require('./src/config');
const authRoutes = require('./src/auth/routes');
const dayRoutes = require('./src/days/routes');
const conceptRoutes = require('./src/concepts/routes');
const analyticsRoutes = require('./src/analytics/routes');
const pushRoutes = require('./src/push/routes');

const app = Fastify({ logger: config.nodeEnv !== 'test' });

app.register(cors, { origin: true, credentials: true });
app.register(cookie);
app.register(jwt, { secret: config.jwt.secret });

const staticRoot = path.join(__dirname, '../coach-pwa/dist');
console.log('Static root:', staticRoot);
app.register(staticPlugin, {
  root: staticRoot,
  prefix: '/',
  wildcard: false,
});

app.register(authRoutes, { prefix: '' });
app.register(dayRoutes, { prefix: '' });
app.register(conceptRoutes, { prefix: '' });
app.register(analyticsRoutes, { prefix: '' });
app.register(pushRoutes, { prefix: '' });

app.get('/health', async () => ({ status: 'ok' }));

app.setNotFoundHandler((request, reply) => {
  console.log('NotFound:', request.url);
  reply.sendFile('index.html');
});

app.listen({ port: 3002, host: '127.0.0.1' }).then(() => {
  console.log('test server on 3002');
});
