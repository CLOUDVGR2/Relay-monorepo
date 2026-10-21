FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run lint && npm test && npm run build
RUN chown -R node:node /app
USER node

CMD ["sh", "-c", "echo 'Frontend CI checks passed'"]
