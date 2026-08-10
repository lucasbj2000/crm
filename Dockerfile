FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV NO_OPEN=1
ENV WHATSBOT_HOST=0.0.0.0
ENV WHATSBOT_DATA_DIR=/data
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data
EXPOSE 3030
CMD ["npm", "start"]
