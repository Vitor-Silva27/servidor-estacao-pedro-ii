import type { RequestHandler } from "express";
import type { Role } from "../../modules/users/users.types";
import { ForbiddenError, UnauthorizedError } from "../errors/AppError";

export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) throw new ForbiddenError();
    next();
  };
}
