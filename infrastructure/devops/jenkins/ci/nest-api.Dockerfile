FROM node:22-alpine
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/nest-api/package.json services/nest-api/package.json

RUN pnpm install --filter @relay/nest-api... --frozen-lockfile

COPY . .

WORKDIR /workspace/services/nest-api

RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm exec prisma generate

RUN pnpm run lint && pnpm run build

WORKDIR /workspace

# Prisma generation and compilation run before dropping privileges.
RUN chown -R node:node /workspace
USER node

CMD ["pnpm", "--filter", "@relay/nest-api", "run", "test"]
