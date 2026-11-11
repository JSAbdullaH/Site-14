const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./config');
const routes = require('./routes');
const { cors } = require('./middlewares/cors.middleware');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();

app.set('trust proxy', config.TRUST_PROXY);
app.disable('x-powered-by');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
