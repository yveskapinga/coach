'use strict';

const webpush = require('web-push');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

webpush.setVapidDetails(
  'mailto:coach@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

async function pushRoutes(fastify, options) {

  fastify.get('/push/vapid-public-key', async (request, reply) => {
    return reply.send({ publicKey: vapidKeys.publicKey });
  });

  fastify.post('/push/subscribe', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.id;
    const { endpoint, keys } = request.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return reply.status(400).send({ error: 'Invalid subscription' });
    }
    try {
      await query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
        [userId, endpoint, keys.p256dh, keys.auth],
        userId
      );
      return reply.send({ message: 'Subscribed' });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Subscription failed' });
    }
  });

  fastify.post('/push/test', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.id;
    try {
      const result = await query(
        `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
        [userId],
        userId
      );
      const payload = JSON.stringify({
        title: 'Coach Life',
        body: 'Notification de test fonctionnelle !',
        tag: 'test',
      });
      for (const sub of result.rows) {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        ).catch(err => fastify.log.error('Push error:', err));
      }
      return reply.send({ message: 'Notifications sent' });
    } catch (err) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Push failed' });
    }
  });
}

module.exports = pushRoutes;
