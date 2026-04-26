const fastify = require('fastify')();
fastify.get('/', async () => 'hello');
fastify.listen({ port: 3002, host: '127.0.0.1' }).then(() => console.log('ok'));
