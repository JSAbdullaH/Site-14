FROM node:22-bookworm-slim

ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

WORKDIR /app

COPY package.json package-lock.json prisma.config.mjs ./
COPY prisma ./prisma

RUN apt-get update \
 && npm ci \
 && npx puppeteer browsers install chrome --install-deps \
 && apt-get install -y --no-install-recommends fonts-liberation fonts-noto-core \
 && rm -rf /var/lib/apt/lists/* \
 && npm prune --omit=dev \
 && npm cache clean --force

COPY . .

RUN mkdir -p storage/reports

ENV NODE_ENV=production

EXPOSE 4000

CMD ["node", "--experimental-strip-types", "--no-warnings=ExperimentalWarning", "src/server.js"]
