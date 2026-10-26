FROM node:22-alpine
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --filter @relay/web... --frozen-lockfile

COPY . .

RUN pnpm --filter @relay/web run lint \
    && pnpm --filter @relay/web run test \
    && pnpm --filter @relay/web run build

# The CI test command runs as the unprivileged Node.js user.
RUN chown -R node:node /workspace
USER node

CMD ["pnpm", "--filter", "@relay/web", "run", "test"]
