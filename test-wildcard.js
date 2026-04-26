const fastify = require('fastify')();
fastify.get('/health', async () => 'ok');
fastify.get('/*', async () => 'fallback');
fastify.listen({ port: 3002, host: '127.0.0.1' }).then(() => {
  console.log('listening');
});
