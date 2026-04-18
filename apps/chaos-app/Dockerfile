# ハマりポイント:
# Apple Silicon (arm64) のローカルマシンで `docker build` すると arm64 イメージが
# 生成されます。Fargate は x86_64 なので、push した arm64 イメージは
# "exec format error" で起動できません。必ず:
#   docker buildx build --platform=linux/amd64 --load -t ... .
# でクロスビルドして push してください（scripts/deploy.sh はこれを強制しています）。
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
ENV PORT=8080
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json
USER app
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "dist/index.js"]
