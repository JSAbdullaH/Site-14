const app = require('./app');
const config = require('./config');
const { startSweeper } = require('./services/presence.service');

app.listen(config.PORT, '0.0.0.0', () => {
  console.log(`API listening on 0.0.0.0:${config.PORT} (${config.NODE_ENV})`);
  startSweeper();
});
