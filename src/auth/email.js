'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
  return transporter;
}

async function sendPasswordReset(email, token, firstName) {
  const transport = getTransporter();
  const resetUrl = `${config.appUrl}/reset-password?token=${encodeURIComponent(token)}`;

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; color: #1e293b;">
      <h1 style="color: #0f172a; margin-bottom: 8px;">Coach Life</h1>
      <h2 style="color: #38bdf8; margin-top: 0;">Réinitialisation de mot de passe</h2>
      <p>Bonjour ${firstName || ''},</p>
      <p>Tu as demandé à réinitialiser ton mot de passe. Clique sur le lien ci-dessous pour choisir un nouveau mot de passe :</p>
      <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #38bdf8, #0ea5e9); color: #0f172a; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; margin: 16px 0;">Réinitialiser mon mot de passe</a>
      <p style="color: #64748b; font-size: 14px;">Ce lien est valable pendant 1 heure.</p>
      <p style="color: #64748b; font-size: 14px;">Si tu n'as pas fait cette demande, ignore cet email.</p>
    </div>
  `;

  const text = `Bonjour ${firstName || ''},\n\nTu as demandé à réinitialiser ton mot de passe.\n\nClique sur ce lien : ${resetUrl}\n\nCe lien est valable pendant 1 heure.\n\nSi tu n'as pas fait cette demande, ignore cet email.`;

  if (transport) {
    await transport.sendMail({
      from: config.smtp.from,
      to: email,
      subject: 'Réinitialise ton mot de passe - Coach Life',
      text,
      html,
    });
    return { sent: true };
  }

  // Fallback: no SMTP configured
  return { sent: false, debugUrl: resetUrl };
}

module.exports = { sendPasswordReset };
