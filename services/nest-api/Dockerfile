# Build the Nest application and generate its Prisma client.
FROM node:22-alpine AS builder

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/nest-api/package.json services/nest-api/package.json

RUN pnpm install --filter @relay/nest-api... --frozen-lockfile

COPY services/nest-api services/nest-api

WORKDIR /workspace/services/nest-api

# Generation requires a syntactically valid URL but does not connect to the database.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm exec prisma generate
RUN pnpm run build

# Preserve the native Prisma engine in compiled output, as in the existing image.
RUN mkdir -p dist/generated/prisma \
    && find src/generated/prisma -maxdepth 1 -type f -name "libquery_engine-*.so.node" -exec cp -v {} dist/generated/prisma/ \; \
    && test -n "$(find dist/generated/prisma -maxdepth 1 -type f -name "libquery_engine-*.so.node" -print -quit)"

FROM node:22-alpine AS runtime

RUN addgroup -S -g 10001 app \
    && adduser -S -D -H -u 10001 -G app app

ENV NODE_ENV=production
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/nest-api/package.json services/nest-api/package.json

RUN corepack enable \
    && pnpm install --filter @relay/nest-api... --prod --frozen-lockfile

COPY --from=builder --chown=10001:10001 /workspace/services/nest-api/dist ./services/nest-api/dist
COPY --from=builder --chown=10001:10001 /workspace/services/nest-api/prisma ./services/nest-api/prisma
COPY --from=builder --chown=10001:10001 /workspace/services/nest-api/src/generated/prisma ./services/nest-api/src/generated/prisma

WORKDIR /workspace/services/nest-api

USER 10001:10001

EXPOSE 3000

CMD ["node", "dist/main.js"]
