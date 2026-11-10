FROM node:22-alpine
WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/mobile/package.json apps/mobile/package.json

RUN pnpm install --filter @relay/mobile... --frozen-lockfile

COPY . .

RUN pnpm --filter @relay/mobile run lint \
    && pnpm --filter @relay/mobile run typecheck

RUN chown -R node:node /workspace
USER node

CMD ["sh", "-c", "echo 'Mobile CI checks passed'"]
