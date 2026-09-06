import bcrypt from "bcryptjs";
import { AuthService, type RefreshStore } from "./auth.service";
import { TokenService } from "./token.service";
import type { UsersRepository } from "../users/users.repository";
import type { UserRecord } from "../users/users.types";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../shared/errors/AppError";

const tokens = new TokenService({
  accessSecret: "a",
  refreshSecret: "r",
  accessExpires: "15m",
  refreshExpires: "7d",
});

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "u1",
    name: "Ana",
    email: "ana@ex.com",
    passwordHash: bcrypt.hashSync("senha1234", 10),
    role: "TOURIST",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup() {
  const users = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<UsersRepository>;
  const store = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  } as unknown as jest.Mocked<RefreshStore>;
  const service = new AuthService(users, tokens, store);
  return { users, store, service };
}

describe("AuthService.register", () => {
  it("cria TOURIST com senha hasheada, salva refresh no store e devolve tokens", async () => {
    const { users, store, service } = setup();
    users.findByEmail.mockResolvedValue(null);
    users.create.mockImplementation(async (data) => makeUser({ ...data, id: "novo" }));

    const result = await service.register({ name: "Ana", email: "ana@ex.com", password: "senha1234" });

    const created = users.create.mock.calls[0][0];
    expect(created.passwordHash).not.toBe("senha1234");
    expect(bcrypt.compareSync("senha1234", created.passwordHash)).toBe(true);
    expect(result.user).toEqual({ id: "novo", name: "Ana", email: "ana@ex.com", role: "TOURIST" });
    expect(result).not.toHaveProperty("user.passwordHash");
    expect(tokens.verifyAccess(result.accessToken).sub).toBe("novo");
    const { jti } = tokens.verifyRefresh(result.refreshToken);
    expect(store.set).toHaveBeenCalledWith(`refresh:${jti}`, "novo", "EX", expect.any(Number));
  });

  it("lança 409 se o email já existe", async () => {
    const { users, service } = setup();
    users.findByEmail.mockResolvedValue(makeUser());
    await expect(
      service.register({ name: "Ana", email: "ana@ex.com", password: "senha1234" }),
    ).rejects.toThrow(ConflictError);
    expect(users.create).not.toHaveBeenCalled();
  });
});

describe("AuthService.login", () => {
  it("devolve tokens com credenciais corretas", async () => {
    const { users, service } = setup();
    users.findByEmail.mockResolvedValue(makeUser());
    const result = await service.login({ email: "ana@ex.com", password: "senha1234" });
    expect(result.user.id).toBe("u1");
    expect(result.accessToken).toEqual(expect.any(String));
  });

  it("lança 401 com email inexistente", async () => {
    const { users, service } = setup();
    users.findByEmail.mockResolvedValue(null);
    await expect(service.login({ email: "x@ex.com", password: "senha1234" })).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("lança 401 com senha errada", async () => {
    const { users, service } = setup();
    users.findByEmail.mockResolvedValue(makeUser());
    await expect(service.login({ email: "ana@ex.com", password: "errada123" })).rejects.toThrow(
      UnauthorizedError,
    );
  });
});

describe("AuthService.refresh", () => {
  it("rotaciona: apaga o jti antigo e emite par novo", async () => {
    const { users, store, service } = setup();
    users.findById.mockResolvedValue(makeUser());
    const old = tokens.signRefresh("u1");
    store.get.mockResolvedValue("u1");

    const result = await service.refresh(old.token);

    expect(store.get).toHaveBeenCalledWith(`refresh:${old.jti}`);
    expect(store.del).toHaveBeenCalledWith(`refresh:${old.jti}`);
    const fresh = tokens.verifyRefresh(result.refreshToken);
    expect(fresh.jti).not.toBe(old.jti);
    expect(store.set).toHaveBeenCalledWith(`refresh:${fresh.jti}`, "u1", "EX", expect.any(Number));
  });

  it("lança 401 se o jti não está no store (já usado ou revogado)", async () => {
    const { store, service } = setup();
    const old = tokens.signRefresh("u1");
    store.get.mockResolvedValue(null);
    await expect(service.refresh(old.token)).rejects.toThrow(UnauthorizedError);
    expect(store.del).not.toHaveBeenCalled();
  });

  it("lança 401 com token inválido", async () => {
    const { service } = setup();
    await expect(service.refresh("lixo")).rejects.toThrow(UnauthorizedError);
  });
});

describe("AuthService.logout", () => {
  it("apaga o jti do store", async () => {
    const { store, service } = setup();
    const { token, jti } = tokens.signRefresh("u1");
    await service.logout(token);
    expect(store.del).toHaveBeenCalledWith(`refresh:${jti}`);
  });

  it("ignora token inválido sem lançar", async () => {
    const { store, service } = setup();
    await expect(service.logout("lixo")).resolves.toBeUndefined();
    expect(store.del).not.toHaveBeenCalled();
  });
});

describe("AuthService.me", () => {
  it("devolve o usuário público", async () => {
    const { users, service } = setup();
    users.findById.mockResolvedValue(makeUser());
    await expect(service.me("u1")).resolves.toEqual({
      id: "u1",
      name: "Ana",
      email: "ana@ex.com",
      role: "TOURIST",
    });
  });

  it("lança 404 se não existe", async () => {
    const { users, service } = setup();
    users.findById.mockResolvedValue(null);
    await expect(service.me("x")).rejects.toThrow(NotFoundError);
  });
});
