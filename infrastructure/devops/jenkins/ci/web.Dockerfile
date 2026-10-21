FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run lint && npm test && npm run build
CMD ["sh", "-c", "echo 'Frontend CI checks passed'"]
