'use strict';

const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

async function analyticsRoutes(fastify, options) {

  // GET /patterns
  fastify.get('/patterns', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.id;

    try {
      const result = await query(
        `SELECT get_user_patterns($1) as patterns`,
        [userId],
        userId
      );
      return reply.send({ patterns: result.rows[0].patterns });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Patterns retrieval failed' });
    }
  });
}

module.exports = analyticsRoutes;
