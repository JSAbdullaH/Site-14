const app = require('./app');
const config = require('./config');
const { startSweeper } = require('./services/presence.service');

app.listen(config.PORT, () => {
  console.log(`API listening on :${config.PORT}`);
  startSweeper();
});
