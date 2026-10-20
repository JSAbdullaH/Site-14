// Guard for the scripts that wipe data (seed and rollback).
// They run only on a database on this machine, never in production,
// unless ALLOW_REMOTE_RESET=true says the remote database is disposable.
function assertSafeTarget(url, action) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Refusing to ${action}: NODE_ENV is production.`);
  }
  const host = new URL(url).hostname;
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  if (!local && process.env.ALLOW_REMOTE_RESET !== 'true') {
    throw new Error(
      `Refusing to ${action} on ${host}: it deletes data. ` +
      'Set ALLOW_REMOTE_RESET=true only if that database holds demo data.',
    );
  }
}

module.exports = { assertSafeTarget };
