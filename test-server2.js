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

const staticRoot = path.join(__dirname, '../coach-pwa/dist');
console.log('Static root:', staticRoot);
app.register(staticPlugin, {
  root: staticRoot,
  prefix: '/',
  wildcard: false,
});

async function r1(f, o) { f.get('/auth/login', async () => ({ ok: 1 })); }
async function r2(f, o) { f.get('/days', async () => ({ ok: 2 })); }
async function r3(f, o) { f.get('/concepts/suggest', async () => ({ ok: 3 })); }
async function r4(f, o) { f.get('/patterns', async () => ({ ok: 4 })); }
async function r5(f, o) { f.get('/push/key', async () => ({ ok: 5 })); }

app.register(r1, { prefix: '' });
app.register(r2, { prefix: '' });
app.register(r3, { prefix: '' });
app.register(r4, { prefix: '' });
app.register(r5, { prefix: '' });

app.get('/health', async () => ({ status: 'ok' }));

app.setNotFoundHandler((request, reply) => {
  console.log('NotFound:', request.url);
  reply.sendFile('index.html');
});

app.listen({ port: 3002, host: '127.0.0.1' }).then(() => {
  console.log('test server on 3002');
});
