import { readFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import { env } from "./config/env";
import { UPLOADS_DIR } from "./config/paths";
import { prisma } from "./lib/prisma";
import { redis } from "./lib/redis";
import { createAttractionsRouter } from "./modules/attractions/attractions.routes";
import { AttractionsRepository } from "./modules/attractions/attractions.repository";
import { AttractionsService, attractionPhotosDir } from "./modules/attractions/attractions.service";
import { createAuthRouter } from "./modules/auth/auth.routes";
import { AuthService } from "./modules/auth/auth.service";
import { TokenService } from "./modules/auth/token.service";
import { createHealthRouter } from "./modules/health/health.routes";
import { UsersRepository } from "./modules/users/users.repository";
import { createCache } from "./shared/cache/cache";
import { NotFoundError } from "./shared/errors/AppError";
import { errorHandler } from "./shared/middlewares/errorHandler";
import { createLocalStorage } from "./shared/storage/localStorage";
import { createPhotoManager } from "./shared/photos/photos";

function loadOpenApi() {
  const file = path.resolve(process.cwd(), "docs/openapi.yaml");
  return YAML.parse(readFileSync(file, "utf8"));
}

export function createApp() {
  const app = express();
  app.use(express.json());

  const tokens = new TokenService({
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpires: env.JWT_ACCESS_EXPIRES,
    refreshExpires: env.JWT_REFRESH_EXPIRES,
  });
  const users = new UsersRepository(prisma);
  const authService = new AuthService(users, tokens, redis);
  const storage = createLocalStorage(UPLOADS_DIR);
  const cache = createCache(redis);
  const attractionsRepository = new AttractionsRepository(prisma);
  const attractionsService = new AttractionsService(
    attractionsRepository,
    cache,
    createPhotoManager(attractionsRepository, storage, attractionPhotosDir),
  );

  app.use("/health", createHealthRouter({ prisma, redis }));
  app.use("/api/v1/auth", createAuthRouter(authService, tokens));
  app.use("/api/v1/attractions", createAttractionsRouter(attractionsService, tokens));
  app.use("/uploads", express.static(UPLOADS_DIR));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(loadOpenApi()));

  app.use((_req, _res, next) => next(new NotFoundError("Rota não encontrada")));
  app.use(errorHandler);

  return app;
}
