'use strict';

require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  pg: {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT, 10) || 5432,
    database: process.env.PG_DATABASE || 'coach_life',
    user: process.env.PG_USER || 'coach_user',
    password: process.env.PG_PASSWORD || 'change_me',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'default_secret_change_me',
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },
};
