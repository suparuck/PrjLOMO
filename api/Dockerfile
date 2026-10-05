# API ของ EV Monitor — Node.js 22 + Fastify (หลาย stage: build ด้วย dev deps แล้วรันด้วย prod deps เท่านั้น)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1
CMD ["node", "dist/index.js"]
