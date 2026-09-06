import type { Request, Response } from "express";
import { authenticate } from "./authenticate";
import { authorize } from "./authorize";
import { TokenService } from "../../modules/auth/token.service";
import { ForbiddenError, UnauthorizedError } from "../errors/AppError";

const tokens = new TokenService({
  accessSecret: "a",
  refreshSecret: "r",
  accessExpires: "15m",
  refreshExpires: "7d",
});
const res = {} as Response;

describe("authenticate", () => {
  it("preenche req.user a partir do Bearer token", () => {
    const token = tokens.signAccess({ sub: "u1", role: "TOURIST" });
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const next = jest.fn();
    authenticate(tokens)(req, res, next);
    expect(req.user).toEqual({ id: "u1", role: "TOURIST" });
    expect(next).toHaveBeenCalledWith();
  });

  it("lança 401 sem header", () => {
    const req = { headers: {} } as Request;
    expect(() => authenticate(tokens)(req, res, jest.fn())).toThrow(UnauthorizedError);
  });

  it("lança 401 com token inválido", () => {
    const req = { headers: { authorization: "Bearer lixo" } } as Request;
    expect(() => authenticate(tokens)(req, res, jest.fn())).toThrow(UnauthorizedError);
  });
});

describe("authorize", () => {
  it("deixa passar quando a role está na lista", () => {
    const req = { user: { id: "u1", role: "ADMIN" } } as Request;
    const next = jest.fn();
    authorize("ADMIN")(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("lança 403 quando a role não está na lista", () => {
    const req = { user: { id: "u1", role: "TOURIST" } } as Request;
    expect(() => authorize("ADMIN")(req, res, jest.fn())).toThrow(ForbiddenError);
  });

  it("lança 401 quando não há req.user", () => {
    const req = {} as Request;
    expect(() => authorize("ADMIN")(req, res, jest.fn())).toThrow(UnauthorizedError);
  });
});
