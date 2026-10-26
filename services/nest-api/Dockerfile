FROM node:26-alpine AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/nest-api/package.json services/nest-api/package.json

RUN pnpm install --filter @relay/nest-api... --frozen-lockfile

COPY services/nest-api services/nest-api

WORKDIR /workspace/services/nest-api

RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm exec prisma generate

RUN pnpm run build

RUN mkdir -p dist/generated/prisma \
 && find src/generated/prisma -maxdepth 1 -type f \
      -name 'libquery_engine-*.so.node' \
      -exec cp -v {} dist/generated/prisma/ \; \
 && test -n "$(find dist/generated/prisma -maxdepth 1 -type f \
      -name 'libquery_engine-*.so.node' -print -quit)"

FROM node:26-alpine AS production-dependencies

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/nest-api/package.json services/nest-api/package.json

RUN pnpm install --filter @relay/nest-api... --prod --frozen-lockfile

FROM node:26-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000

RUN addgroup -S -g 10001 app \
 && adduser -S -D -H -u 10001 -G app app

WORKDIR /workspace

COPY --from=production-dependencies --chown=10001:10001 \
    /workspace/node_modules ./node_modules
COPY --from=production-dependencies --chown=10001:10001 \
    /workspace/services/nest-api/node_modules ./services/nest-api/node_modules
COPY --from=production-dependencies --chown=10001:10001 \
    /workspace/services/nest-api/package.json ./services/nest-api/package.json
COPY --from=build --chown=10001:10001 \
    /workspace/services/nest-api/dist ./services/nest-api/dist
COPY --from=build --chown=10001:10001 \
    /workspace/services/nest-api/prisma ./services/nest-api/prisma
COPY --from=build --chown=10001:10001 \
    /workspace/services/nest-api/src/generated/prisma ./services/nest-api/src/generated/prisma

WORKDIR /workspace/services/nest-api

USER 10001:10001

EXPOSE 3000

CMD ["node", "dist/main.js"]
