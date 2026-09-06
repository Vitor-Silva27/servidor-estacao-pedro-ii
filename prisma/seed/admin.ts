import bcrypt from "bcryptjs";
import { env } from "../../src/config/env";
import { prisma } from "../../src/lib/prisma";

export async function seedAdmin(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: env.ADMIN_EMAIL } });
  if (existing) {
    console.log(`Admin ${env.ADMIN_EMAIL} já existe, nada a fazer.`);
    return;
  }

  await prisma.user.create({
    data: {
      name: env.ADMIN_NAME,
      email: env.ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 10),
      role: "ADMIN",
    },
  });
  console.log(`Admin ${env.ADMIN_EMAIL} criado.`);
}
