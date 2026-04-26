const path = require('path');
const Fastify = require('fastify');
const jwt = require('@fastify/jwt');
const cors = require('@fastify/cors');
const cookie = require('@fastify/cookie');
const staticPlugin = require('@fastify/static');

const app = Fastify({ logger: false });

app.register(cors, { origin: true, credentials: true });
app.register(cookie);
app.register(jwt, { secret: 'test' });

app.register(staticPlugin, {
  root: path.join(__dirname, '../coach-pwa/dist'),
  prefix: '/',
  wildcard: false,
});

async function authRoutes(fastify, opts) {
  fastify.get('/auth/login', async () => ({ ok: true }));
}
async function dayRoutes(fastify, opts) {
  fastify.get('/days', async () => ({ days: [] }));
}

app.register(authRoutes, { prefix: '' });
app.register(dayRoutes, { prefix: '' });

app.get('/health', async () => ({ status: 'ok' }));

app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api') || request.url.startsWith('/auth') || request.url.startsWith('/days') || request.url.startsWith('/health')) {
    reply.status(404).send({ error: 'Not found' });
  } else {
    reply.sendFile('index.html');
  }
});

app.listen({ port: 3002, host: '127.0.0.1' }).then(() => {
  console.log('test server on 3002');
});
