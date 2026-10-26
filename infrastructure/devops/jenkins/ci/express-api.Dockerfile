FROM node:22-alpine
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/express-api/package.json services/express-api/package.json
COPY services/nest-api/package.json services/nest-api/package.json

RUN pnpm install --filter @relay/express-api... --filter @relay/nest-api... --frozen-lockfile

COPY . .
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm --filter @relay/nest-api exec prisma generate \
    && pnpm --filter @relay/nest-api run build \
    && chown -R node:node /workspace

USER node

CMD ["pnpm", "--filter", "@relay/express-api", "run", "test:integration"]
