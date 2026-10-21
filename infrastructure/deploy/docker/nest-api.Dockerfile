FROM node:22-alpine AS build
WORKDIR /app
COPY services/nest-api/package.json services/nest-api/package-lock.json ./
RUN npm ci
COPY services/nest-api/nest-cli.json services/nest-api/tsconfig.json services/nest-api/tsconfig.build.json ./
COPY services/nest-api/prisma.config.ts ./
COPY services/nest-api/prisma ./prisma
COPY services/nest-api/src ./src
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build npx prisma generate
RUN npm run build
RUN set -eux; \
    engine="$(find src/generated/prisma -maxdepth 1 -type f -name 'libquery_engine-*.so.node' -print -quit)"; \
    test -n "$engine"; \
    cp "$engine" dist/generated/prisma/

FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY services/nest-api/package.json services/nest-api/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
