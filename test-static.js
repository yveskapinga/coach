const path = require('path');
const fastify = require('fastify')();
const staticPlugin = require('@fastify/static');
const jwt = require('@fastify/jwt');
const cors = require('@fastify/cors');
const cookie = require('@fastify/cookie');

fastify.register(cors, { origin: true, credentials: true });
fastify.register(cookie);
fastify.register(jwt, { secret: 'test' });

fastify.register(staticPlugin, {
  root: path.join(__dirname, '../coach-pwa/dist'),
  prefix: '/',
  wildcard: false,
});

async function apiRoutes(fastify, opts) {
  fastify.get('/health', async () => ({ status: 'ok' }));
  fastify.get('/auth/login', async () => ({ token: 'test' }));
}

fastify.register(apiRoutes, { prefix: '' });

fastify.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api') || request.url.startsWith('/health') || request.url.startsWith('/auth')) {
    reply.status(404).send({ error: 'Not found' });
  } else {
    reply.sendFile('index.html');
  }
});

fastify.listen({ port: 3002, host: '127.0.0.1' }).then(() => {
  console.log('test server on 3002');
});
