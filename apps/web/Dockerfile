FROM node:22-alpine AS builder

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --filter @relay/web... --frozen-lockfile

COPY . .

RUN pnpm --filter @relay/web run build

FROM nginx:alpine

# Use a writable PID path when running Nginx as a non-root user.
RUN sed -i 's#^pid .*;#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
    && grep -q '^pid /tmp/nginx.pid;' /etc/nginx/nginx.conf

COPY --from=builder /workspace/apps/web/dist /usr/share/nginx/html
COPY --from=builder /workspace/apps/web/nginx.conf /etc/nginx/conf.d/default.conf

RUN mkdir -p /var/cache/nginx/client_temp \
    /var/cache/nginx/proxy_temp \
    /var/cache/nginx/fastcgi_temp \
    /var/cache/nginx/uwsgi_temp \
    /var/cache/nginx/scgi_temp \
    && chown -R 101:101 /var/cache/nginx \
    && touch /tmp/nginx.pid \
    && chown 101:101 /tmp/nginx.pid

USER 101:101

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
