# ハマりポイント (chaos-app の Dockerfile にも同じコメントあり):
# Apple Silicon 上のローカル build は arm64 イメージになり、Fargate (x86_64) で
# exec format error を起こします。必ず --platform=linux/amd64 でビルドしてください。
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile=false
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8081
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json
USER app
EXPOSE 8081
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8081/health || exit 1
CMD ["node", "dist/index.js"]
