const config = require('../config');
const authService = require('../services/auth.service');

const REFRESH_COOKIE = 'site14_refresh';
const cookieOptions = () => ({
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/v1/auth',
});

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions(), maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400_000 });
}

const clearRefreshCookie = (res) => res.clearCookie(REFRESH_COOKIE, cookieOptions());

const refreshTokenFrom = (req) => req.body.refresh_token || (req.cookies && req.cookies[REFRESH_COOKIE]);

function sendSession(res, session) {
  setRefreshCookie(res, session.refresh_token);
  res.json(session);
}

async function register(req, res) {
  res.status(201).json(await authService.register(req.body));
}

async function verifyEmail(req, res) {
  res.json(await authService.verifyEmail(req.body));
}

async function resendVerification(req, res) {
  await authService.resendVerification(req.body);
  res.status(204).end();
}

async function login(req, res) {
  res.json(await authService.login(req.body));
}

async function verifyLogin(req, res) {
  sendSession(res, await authService.verifyLogin(req.body));
}

async function refresh(req, res) {
  try {
    res.json(await authService.refresh(refreshTokenFrom(req)));
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
}

async function logout(req, res) {
  await authService.logout({ token: refreshTokenFrom(req), userId: req.auth.userId });
  clearRefreshCookie(res);
  res.status(204).end();
}

async function forgotPassword(req, res) {
  await authService.forgotPassword(req.body);
  res.status(204).end();
}

async function resetPassword(req, res) {
  res.json(await authService.resetPassword(req.body));
}

module.exports = {
  register,
  verifyEmail,
  resendVerification,
  login,
  verifyLogin,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  sendSession,
  REFRESH_COOKIE,
};
