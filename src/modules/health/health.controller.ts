import type { RequestHandler } from "express";
import type Redis from "ioredis";
import type { PrismaClient } from "../../generated/prisma/client";

type Deps = { prisma: PrismaClient; redis: Redis };

type Status = "ok" | "error";

async function check(fn: () => Promise<unknown>): Promise<Status> {
  try {
    await fn();
    return "ok";
  } catch {
    return "error";
  }
}

export function createHealthController({ prisma, redis }: Deps): RequestHandler {
  return async (_req, res) => {
    const [postgres, redisStatus] = await Promise.all([
      check(() => prisma.$queryRaw`SELECT 1`),
      check(() => redis.ping()),
    ]);
    const healthy = postgres === "ok" && redisStatus === "ok";
    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      postgres,
      redis: redisStatus,
    });
  };
}
