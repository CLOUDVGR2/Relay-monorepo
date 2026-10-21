FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate

RUN npm run lint && npm run build

CMD ["npm", "test"]
