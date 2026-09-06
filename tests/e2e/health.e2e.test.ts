import request from "supertest";
import { createApp } from "../../src/app";

describe("GET /health", () => {
  it("responde 200 com tudo ok", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", postgres: "ok", redis: "ok" });
  });

  it("rota desconhecida responde 404 padronizado", async () => {
    const res = await request(createApp()).get("/nada");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
