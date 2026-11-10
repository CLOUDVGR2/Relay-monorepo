FROM node:22-bookworm-slim

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /workspace

RUN corepack enable && chown node:node /workspace

USER node

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/mobile/package.json apps/mobile/package.json

RUN pnpm install --filter @relay/mobile... --frozen-lockfile

COPY --chown=node:node apps/mobile apps/mobile

WORKDIR /workspace/apps/mobile

ENV EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0
ENV EXPO_NO_TELEMETRY=1

EXPOSE 8081

CMD ["pnpm", "exec", "expo", "start", "--host", "lan", "--port", "8081"]
