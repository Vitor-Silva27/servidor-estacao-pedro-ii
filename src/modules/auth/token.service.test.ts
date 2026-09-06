import { TokenService } from "./token.service";
import { UnauthorizedError } from "../../shared/errors/AppError";

const config = {
  accessSecret: "access-secret",
  refreshSecret: "refresh-secret",
  accessExpires: "15m",
  refreshExpires: "7d",
};

describe("TokenService", () => {
  const tokens = new TokenService(config);

  afterEach(() => jest.useRealTimers());

  it("assina e verifica um access token com sub e role", () => {
    const token = tokens.signAccess({ sub: "user-1", role: "ADMIN" });
    expect(tokens.verifyAccess(token)).toEqual({ sub: "user-1", role: "ADMIN" });
  });

  it("assina um refresh token com jti único e TTL em segundos", () => {
    const a = tokens.signRefresh("user-1");
    const b = tokens.signRefresh("user-1");
    expect(a.jti).not.toBe(b.jti);
    expect(a.ttlSeconds).toBeGreaterThan(7 * 24 * 60 * 60 - 5);
    expect(a.ttlSeconds).toBeLessThanOrEqual(7 * 24 * 60 * 60);
    expect(tokens.verifyRefresh(a.token)).toEqual({ sub: "user-1", jti: a.jti });
  });

  it("rejeita access token assinado com outro segredo", () => {
    const other = new TokenService({ ...config, accessSecret: "errado" });
    const token = other.signAccess({ sub: "user-1", role: "TOURIST" });
    expect(() => tokens.verifyAccess(token)).toThrow(UnauthorizedError);
  });

  it("não aceita refresh token no lugar de access token", () => {
    const { token } = tokens.signRefresh("user-1");
    expect(() => tokens.verifyAccess(token)).toThrow(UnauthorizedError);
  });

  it("rejeita access token expirado", () => {
    jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
    const token = tokens.signAccess({ sub: "user-1", role: "TOURIST" });
    jest.setSystemTime(new Date("2026-01-01T00:16:00Z"));
    expect(() => tokens.verifyAccess(token)).toThrow(UnauthorizedError);
  });

  it("rejeita lixo", () => {
    expect(() => tokens.verifyRefresh("nao-e-um-jwt")).toThrow(UnauthorizedError);
  });
});
