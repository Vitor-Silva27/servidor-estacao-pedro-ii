import { prisma } from "../src/lib/prisma";
import { redis } from "../src/lib/redis";
import { seedAdmin } from "./seed/admin";
import { seedAttractions } from "./seed/attractions";
import { seedEvents } from "./seed/events";

async function main() {
  await seedAdmin();
  await seedAttractions();
  await seedEvents();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await redis.quit();
  });
