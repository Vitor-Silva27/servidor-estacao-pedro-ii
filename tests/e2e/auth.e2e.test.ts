import request from "supertest";
import { createApp } from "../../src/app";

const app = createApp();
const ana = { name: "Ana", email: "ana@ex.com", password: "senha1234" };

describe("fluxo de auth", () => {
  let accessToken: string;
  let refreshToken: string;

  it("POST /register cria a conta e devolve tokens", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(ana);
    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: "Ana",
      email: "ana@ex.com",
      role: "TOURIST",
    });
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
  });

  it("POST /register com email repetido responde 409", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(ana);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("POST /register com body inválido responde 400 com details", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "A", email: "x", password: "123" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      "email",
      "name",
      "password",
    ]);
  });

  it("POST /login com senha errada responde 401", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ana.email, password: "errada123" });
    expect(res.status).toBe(401);
  });

  it("POST /login com credenciais certas devolve tokens", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ana.email, password: ana.password });
    expect(res.status).toBe(200);
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it("GET /me sem token responde 401", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /me com token devolve o usuário", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(ana.email);
  });

  it("POST /refresh rotaciona e invalida o antigo", async () => {
    const first = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(refreshToken);

    const reuse = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(reuse.status).toBe(401);

    accessToken = first.body.accessToken;
    refreshToken = first.body.refreshToken;
  });

  it("POST /logout revoga o refresh token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(res.status).toBe(204);

    const after = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(after.status).toBe(401);
  });
});
