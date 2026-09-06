import { rm } from "node:fs/promises";
import { UPLOADS_DIR } from "../../src/config/paths";
import { prisma } from "../../src/lib/prisma";
import { redis } from "../../src/lib/redis";

beforeAll(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "EventPhoto", "Event", "AttractionPhoto", "Attraction", "User" CASCADE',
  );
  await redis.flushdb();
  await rm(UPLOADS_DIR, { recursive: true, force: true });
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});
