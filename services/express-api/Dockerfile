FROM node:22-alpine AS builder

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/express-api/package.json services/express-api/package.json

RUN pnpm install --filter @relay/express-api... --prod --frozen-lockfile

COPY services/express-api services/express-api

FROM node:22-alpine AS runtime

RUN addgroup -S -g 10001 app && adduser -S -D -H -u 10001 -G app app

WORKDIR /workspace

ENV NODE_ENV=production

COPY --from=builder --chown=10001:10001 /workspace/node_modules ./node_modules
COPY --from=builder --chown=10001:10001 /workspace/services/express-api ./services/express-api

WORKDIR /workspace/services/express-api

USER 10001:10001

EXPOSE 5001

CMD ["node", "src/bootstrap.js"]
