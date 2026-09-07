import { existsSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { createApp } from "../../src/app";
import { UPLOADS_DIR } from "../../src/config/paths";
import { loginAs } from "./helpers/users";

const app = createApp();
const PIXEL = path.join(__dirname, "fixtures/pixel.png");

const lodging = {
  type: "HOSPEDAGEM",
  name: "Pousada E2E",
  description: "Pousada criada pelos testes de ponta a ponta.",
  latitude: -4.42,
  longitude: -41.46,
  address: "Rua das Flores, 10",
  whatsapp: "+55 (86) 99999-0000",
  priceRange: "MEDIO",
  highlights: "Café da manhã incluso",
};

const restaurant = {
  type: "RESTAURANTE",
  name: "Restaurante E2E",
  description: "Restaurante criado pelos testes de ponta a ponta.",
  latitude: -4.43,
  longitude: -41.46,
  address: "Praça Central, 1",
  whatsapp: "5586988880000",
  priceRange: "BAIXO",
};

describe("estabelecimentos", () => {
  let admin: string;
  let tourist: string;
  let lodgingId: string;

  beforeAll(async () => {
    admin = await loginAs(app, "ADMIN");
    tourist = await loginAs(app, "TOURIST");
  });

  it("GET / é público e começa vazio", async () => {
    const res = await request(app).get("/api/v1/establishments");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("POST / sem token dá 401 e com turista dá 403", async () => {
    expect((await request(app).post("/api/v1/establishments").send(lodging)).status).toBe(401);
    expect((await request(app).post("/api/v1/establishments").set("Authorization", `Bearer ${tourist}`).send(lodging)).status).toBe(403);
  });

  it("admin cria hospedagem e restaurante; WhatsApp mascarado volta normalizado", async () => {
    const auth = { Authorization: `Bearer ${admin}` };
    const l = await request(app).post("/api/v1/establishments").set(auth).send(lodging);
    expect(l.status).toBe(201);
    expect(l.body).toMatchObject({ ...lodging, whatsapp: "5586999990000", instagram: null, openingHours: null, coverUrl: null, photos: [] });
    lodgingId = l.body.id;

    const r = await request(app).post("/api/v1/establishments").set(auth).send(restaurant);
    expect(r.status).toBe(201);
    expect(r.body.highlights).toBeNull();
  });

  it("GET /?type=RESTAURANTE devolve só o restaurante", async () => {
    const res = await request(app).get("/api/v1/establishments?type=RESTAURANTE");
    expect(res.body.map((e: { name: string }) => e.name)).toEqual(["Restaurante E2E"]);
    expect(res.body[0]).toEqual({
      id: expect.any(String),
      type: "RESTAURANTE",
      name: "Restaurante E2E",
      coverUrl: null,
      priceRange: "BAIXO",
      address: "Praça Central, 1",
    });
    expect((await request(app).get("/api/v1/establishments")).body).toHaveLength(2);
  });

  it("PUT com type dá 400; PUT válido normaliza o Instagram", async () => {
    const auth = { Authorization: `Bearer ${admin}` };
    const { type, ...fields } = lodging;
    const bad = await request(app).put(`/api/v1/establishments/${lodgingId}`).set(auth).send({ ...fields, type: "RESTAURANTE" });
    expect(bad.status).toBe(400);

    const ok = await request(app).put(`/api/v1/establishments/${lodgingId}`).set(auth).send({ ...fields, instagram: "@Pousada.E2E" });
    expect(ok.status).toBe(200);
    expect(ok.body.instagram).toBe("Pousada.E2E");
    expect(ok.body.type).toBe("HOSPEDAGEM");
  });

  it("upload vira capa e o arquivo é servido", async () => {
    const res = await request(app)
      .post(`/api/v1/establishments/${lodgingId}/photos`)
      .set("Authorization", `Bearer ${admin}`)
      .attach("file", PIXEL);
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/uploads\/establishments\/.+\.png$/);

    const detail = await request(app).get(`/api/v1/establishments/${lodgingId}`);
    expect(detail.body.coverUrl).toBe(res.body.url);
    expect((await request(app).get(res.body.url)).status).toBe(200);
  });

  it("DELETE apaga o estabelecimento e a pasta", async () => {
    const dir = path.join(UPLOADS_DIR, "establishments", lodgingId);
    expect(existsSync(dir)).toBe(true);
    const del = await request(app).delete(`/api/v1/establishments/${lodgingId}`).set("Authorization", `Bearer ${admin}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/v1/establishments/${lodgingId}`)).status).toBe(404);
    expect(existsSync(dir)).toBe(false);
  });
});
