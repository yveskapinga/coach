'use strict';

const config = require('../config');

async function authenticate(request, reply) {
  try {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return reply.status(401).send({ error: 'Missing token' });
    }
    const decoded = await request.jwtVerify();
    if (!decoded.sub) {
      return reply.status(401).send({ error: 'Invalid token payload' });
    }
    request.user = { id: decoded.sub };
  } catch (err) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
}

module.exports = { authenticate };
