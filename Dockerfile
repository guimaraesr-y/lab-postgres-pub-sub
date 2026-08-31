FROM oven/bun:1.4.0-alpine

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY public ./public

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "src/server.ts"]
