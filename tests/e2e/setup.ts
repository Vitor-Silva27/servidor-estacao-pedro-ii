import { prisma } from "../../src/lib/prisma";
import { redis } from "../../src/lib/redis";

beforeAll(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
  await redis.flushdb();
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});
