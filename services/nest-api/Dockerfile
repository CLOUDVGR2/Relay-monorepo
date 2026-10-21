# Compile the application and generate the Prisma client in a toolchain stage.
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Prisma generation needs a syntactically valid URL, but does not connect here.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate
RUN npm run build
RUN mkdir -p dist/generated/prisma \
    && find src/generated/prisma -maxdepth 1 -type f -name "libquery_engine-*.so.node" -exec cp -v {} dist/generated/prisma/ \; \
    && test -n "$(find dist/generated/prisma -maxdepth 1 -type f -name "libquery_engine-*.so.node" -print -quit)"

# Keep development/test dependencies out of the runtime image.
FROM node:22-alpine AS production-dependencies

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Runtime image contains only production dependencies and compiled output.
FROM node:22-alpine AS runtime

RUN addgroup -S -g 10001 app \
    && adduser -S -D -H -u 10001 -G app app

ENV NODE_ENV=production
WORKDIR /app

COPY --from=production-dependencies --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=builder --chown=10001:10001 /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=10001:10001 /app/dist ./dist
COPY --from=builder --chown=10001:10001 /app/prisma ./prisma
COPY --chown=10001:10001 package*.json ./

USER 10001:10001

EXPOSE 3000

CMD ["node", "dist/main.js"]
