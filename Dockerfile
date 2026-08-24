FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3030 \
    WHATSBOT_HOST=0.0.0.0 \
    WHATSBOT_DATA_DIR=/data \
    NO_OPEN=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY server.mjs ./
COPY public ./public
COPY lib ./lib

RUN mkdir -p /data && chown -R node:node /app /data
USER node

EXPOSE 3030
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3030/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
