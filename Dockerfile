FROM node:26-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false
COPY . .
RUN pnpm build

FROM node:26-alpine
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/lib/db/migrations ./migrations
COPY --from=builder --chown=nextjs:nodejs /app/lib/db/seed/categories.json ./seed/categories.json
COPY --from=builder --chown=nextjs:nodejs /app/scripts/entrypoint.mjs ./entrypoint.mjs
USER nextjs
EXPOSE 3000
ENV HOSTNAME=0.0.0.0 PORT=3000
HEALTHCHECK --interval=30s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "entrypoint.mjs"]
