'use strict';

const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

async function conceptRoutes(fastify, options) {

  // GET /concepts/suggest?type=ACTION&q=sport
  fastify.get('/concepts/suggest', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.id;
    const { type, q } = request.query || {};

    if (!type || !q) {
      return reply.status(400).send({ error: 'type and q query params required' });
    }

    try {
      const result = await query(
        `SELECT * FROM suggest_concepts($1, $2)`,
        [type, q],
        userId
      );
      return reply.send({ concepts: result.rows });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Suggestion failed' });
    }
  });
}

module.exports = conceptRoutes;
