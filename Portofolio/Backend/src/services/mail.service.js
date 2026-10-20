const nodemailer = require('nodemailer');
const config = require('../config');

const outbox = [];

const transport = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    })
  : null;

async function send({ to, subject, text }) {
  const message = { from: config.MAIL_FROM, to, subject, text };
  if (transport) {
    await transport.sendMail(message);
  } else if (config.NODE_ENV === 'test') {
    outbox.push(message);
  } else {
    console.log(`\n--- email to ${to} ---\nSubject: ${subject}\n\n${text}\n--- end of email ---\n`);
  }
}

const link = (path, token) => `${config.APP_URL}${path}?token=${encodeURIComponent(token)}`;

function sendVerificationCode(to, { fullName, code }) {
  return send({
    to,
    subject: `Your SITE14 confirmation code: ${code}`,
    text:
      `Hello ${fullName},\n\nYour email confirmation code is ${code}\n\n` +
      `It expires in ${config.EMAIL_VERIFY_TTL_MINUTES} minutes. ` +
      'If you did not register, ignore this email.',
  });
}

function sendAlreadyRegistered(to, { fullName }) {
  return send({
    to,
    subject: 'Someone tried to register with your email',
    text:
      `Hello ${fullName},\n\nSomeone tried to register a new company with this email address, ` +
      `which already has a SITE14 account. To sign in, go to ${config.APP_URL}/login. ` +
      `If you forgot your password, reset it at ${config.APP_URL}/forgot-password.`,
  });
}

function sendLoginCode(to, { fullName, code }) {
  return send({
    to,
    subject: `Your SITE14 sign-in code: ${code}`,
    text:
      `Hello ${fullName},\n\nYour sign-in code is ${code}\n\n` +
      `It expires in ${config.LOGIN_OTP_TTL_MINUTES} minutes. ` +
      'If you did not try to sign in, change your password.',
  });
}

function sendPasswordReset(to, { fullName, token }) {
  return send({
    to,
    subject: 'Reset your SITE14 password',
    text:
      `Hello ${fullName},\n\nSet a new password here:\n${link('/reset-password', token)}\n\n` +
      `The link works once and expires in ${config.PASSWORD_RESET_TTL_MINUTES} minutes. ` +
      'If you did not ask for a reset, ignore this email; your password is unchanged.',
  });
}

function sendInvitation(to, { fullName, companyName, inviterName, token }) {
  return send({
    to,
    subject: `${inviterName} invited you to ${companyName} on SITE14`,
    text:
      `Hello ${fullName},\n\n${inviterName} added you to ${companyName} on SITE14. ` +
      `Choose your own password here:\n${config.APP_URL}/invite/${encodeURIComponent(token)}\n\n` +
      `The link expires in ${config.INVITATION_TTL_HOURS} hours.`,
  });
}

module.exports = {
  outbox,
  sendVerificationCode,
  sendAlreadyRegistered,
  sendLoginCode,
  sendPasswordReset,
  sendInvitation,
};
