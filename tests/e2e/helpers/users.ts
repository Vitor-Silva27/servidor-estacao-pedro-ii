import bcrypt from "bcryptjs";
import type { Express } from "express";
import request from "supertest";
import { prisma } from "../../../src/lib/prisma";
import type { Role } from "../../../src/modules/users/users.types";

const PASSWORD = "senha1234";

/** Garante um usuário com a role dada e devolve o access token dele. */
export async function loginAs(app: Express, role: Role): Promise<string> {
  const email = `${role.toLowerCase()}@e2e.local`;
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: role, email, passwordHash: bcrypt.hashSync(PASSWORD, 10), role },
  });
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  return res.body.accessToken as string;
}
