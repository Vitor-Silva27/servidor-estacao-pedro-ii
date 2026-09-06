import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../../shared/errors/AppError";
import type { Role } from "../users/users.types";

export type TokenConfig = {
  accessSecret: string;
  refreshSecret: string;
  accessExpires: string;
  refreshExpires: string;
};

export type AccessPayload = { sub: string; role: Role };
export type RefreshPayload = { sub: string; jti: string };

export type SignedRefresh = { token: string; jti: string; ttlSeconds: number };

type ExpiresIn = jwt.SignOptions["expiresIn"];

export class TokenService {
  constructor(private readonly config: TokenConfig) {}

  signAccess(payload: AccessPayload): string {
    return jwt.sign({ role: payload.role }, this.config.accessSecret, {
      subject: payload.sub,
      expiresIn: this.config.accessExpires as ExpiresIn,
    });
  }

  signRefresh(userId: string): SignedRefresh {
    const jti = randomUUID();
    const token = jwt.sign({}, this.config.refreshSecret, {
      subject: userId,
      jwtid: jti,
      expiresIn: this.config.refreshExpires as ExpiresIn,
    });
    const { exp } = jwt.decode(token) as { exp: number };
    const ttlSeconds = exp - Math.floor(Date.now() / 1000);
    return { token, jti, ttlSeconds };
  }

  verifyAccess(token: string): AccessPayload {
    const payload = this.verify(token, this.config.accessSecret);
    if (!payload.sub || typeof payload.role !== "string") {
      throw new UnauthorizedError("Token inválido");
    }
    return { sub: payload.sub, role: payload.role as Role };
  }

  verifyRefresh(token: string): RefreshPayload {
    const payload = this.verify(token, this.config.refreshSecret);
    if (!payload.sub || !payload.jti) {
      throw new UnauthorizedError("Token inválido");
    }
    return { sub: payload.sub, jti: payload.jti };
  }

  private verify(token: string, secret: string): jwt.JwtPayload {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
      if (typeof payload === "string") throw new Error("payload inesperado");
      return payload;
    } catch {
      throw new UnauthorizedError("Token inválido ou expirado");
    }
  }
}
