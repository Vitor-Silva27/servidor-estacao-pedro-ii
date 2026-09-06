import type { RequestHandler } from "express";
import type { TokenService } from "../../modules/auth/token.service";
import { UnauthorizedError } from "../errors/AppError";

const PREFIX = "Bearer ";

export function authenticate(tokens: TokenService): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith(PREFIX)) {
      throw new UnauthorizedError("Token não informado");
    }
    const payload = tokens.verifyAccess(header.slice(PREFIX.length));
    req.user = { id: payload.sub, role: payload.role };
    next();
  };
}
