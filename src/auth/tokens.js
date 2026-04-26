'use strict';

const config = require('../config');

function generateAccessToken(fastify, userId) {
  return fastify.jwt.sign(
    { sub: userId },
    { expiresIn: config.jwt.accessExpires }
  );
}

function generateRefreshToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

module.exports = { generateAccessToken, generateRefreshToken };
