import type { User } from "../../generated/prisma/client";

export type Role = "ADMIN" | "TOURIST";

export type UserRecord = User;

export type PublicUser = Pick<User, "id" | "name" | "email" | "role">;

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
