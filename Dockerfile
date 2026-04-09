# ── Stage 1: Build React client ────────────────────────────
FROM node:20-alpine AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY public/ public/
COPY src/ src/
COPY tsconfig.json ./
RUN npm run build:web

# ── Stage 2: Build server ─────────────────────────────────
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src/ src/
RUN npm run build

# ── Stage 3: Production image ─────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Server dependencies (production only)
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev

# Built server + migrations
COPY --from=server-build /app/server/dist/ ./server/dist/

# Built client (served by Express in production)
COPY --from=client-build /app/build/ ./client/

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "server/dist/index.js"]
