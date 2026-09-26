# syntax=docker/dockerfile:1

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS build
WORKDIR /app

ARG VITE_INSFORGE_URL
ARG VITE_INSFORGE_ANON_KEY
ENV VITE_INSFORGE_URL=${VITE_INSFORGE_URL}
ENV VITE_INSFORGE_ANON_KEY=${VITE_INSFORGE_ANON_KEY}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN test -n "$VITE_INSFORGE_URL" \
  && test -n "$VITE_INSFORGE_ANON_KEY" \
  && bun run build

FROM nginx:1-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1
