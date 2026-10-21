FROM node:22-alpine AS dependencies
WORKDIR /app
COPY services/express-api/package.json services/express-api/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=5001
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node services/express-api/package.json ./package.json
COPY --chown=node:node services/express-api/src ./src
USER node
EXPOSE 5001
CMD ["node", "src/bootstrap.js"]
