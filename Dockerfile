# TRAC Library — production container for Render (runtime: docker).
# Multi-stage: install deps -> build -> slim runtime image.
ARG CACHEBUST=2026-10-07T10:00:54.530881Z
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* are inlined into the client bundle at BUILD time, so they must
# be passed as build args (Render provides service env vars to docker builds
# when matching ARGs are declared).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
# Cross-site origins used by the desk nav, login page, shelf borrow links and
# sitemap. Without these ARGs the values set on the Render service never reach
# the client bundle.
ARG NEXT_PUBLIC_SHELF_ORIGIN
ARG NEXT_PUBLIC_LIBRARY_ORIGIN
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SHELF_ORIGIN=$NEXT_PUBLIC_SHELF_ORIGIN \
    NEXT_PUBLIC_LIBRARY_ORIGIN=$NEXT_PUBLIC_LIBRARY_ORIGIN \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
RUN npx next build --webpack

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=10000
# Server-side env vars (AUTH_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# CRON_SECRET, CRON_SCHEDULE_ENABLED, SHELF_ALLOWED_ORIGIN) are injected at
# runtime by Render from service config.
# Render routes to $PORT (default 10000) — `next start` honors PORT.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY package.json next.config.ts ./
EXPOSE 10000
CMD ["npx", "next", "start", "-p", "10000"]
