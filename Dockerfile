FROM node:22-bookworm-slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

FROM base AS dev
CMD ["npm", "run", "dev"]

FROM base AS build
# prisma.config.ts exige DATABASE_URL mesmo para gerar o client; o valor não é usado no build
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build

FROM node:22-bookworm-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/docs/openapi.yaml ./docs/openapi.yaml
EXPOSE 3333
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
