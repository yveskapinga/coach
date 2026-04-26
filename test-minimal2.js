const Fastify = require('fastify');
const app = Fastify({ logger: false });
app.get('/', async () => ({ hello: 'world' }));
app.listen({ port: 3001, host: '0.0.0.0' }).then(() => console.log('ok'));
