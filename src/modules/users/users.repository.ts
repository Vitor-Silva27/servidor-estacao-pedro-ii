import type { PrismaClient } from "../../generated/prisma/client";
import type { UserRecord } from "./users.types";

export type CreateUserData = {
  name: string;
  email: string;
  passwordHash: string;
};

export class UsersRepository {
  constructor(private readonly db: PrismaClient) {}

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  create(data: CreateUserData): Promise<UserRecord> {
    return this.db.user.create({ data });
  }
}
