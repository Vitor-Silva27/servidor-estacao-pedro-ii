import { existsSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { createApp } from "../../src/app";
import { UPLOADS_DIR } from "../../src/config/paths";
import { loginAs } from "./helpers/users";

const app = createApp();
const PIXEL = path.join(__dirname, "fixtures/pixel.png");

const future = {
  name: "Festival E2E",
  description: "Um festival criado pelos testes de ponta a ponta.",
  startsAt: "2099-07-01T00:00:00.000Z",
  endsAt: "2099-07-31T23:59:59.000Z",
  latitude: -4.42,
  longitude: -41.46,
  address: "Centro",
};

const past = {
  name: "Evento passado E2E",
  description: "Um evento que já aconteceu, criado pelos testes.",
  startsAt: "2000-01-01T00:00:00.000Z",
  endsAt: "2000-01-02T00:00:00.000Z",
  latitude: -4.42,
  longitude: -41.46,
};

describe("eventos", () => {
  let admin: string;
  let tourist: string;
  let eventId: string;

  beforeAll(async () => {
    admin = await loginAs(app, "ADMIN");
    tourist = await loginAs(app, "TOURIST");
  });

  it("GET / é público e começa vazio", async () => {
    const res = await request(app).get("/api/v1/events");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("POST / sem token dá 401 e com turista dá 403", async () => {
    expect((await request(app).post("/api/v1/events").send(future)).status).toBe(401);
    const res = await request(app).post("/api/v1/events").set("Authorization", `Bearer ${tourist}`).send(future);
    expect(res.status).toBe(403);
  });

  it("admin cria evento futuro", async () => {
    const res = await request(app).post("/api/v1/events").set("Authorization", `Bearer ${admin}`).send(future);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...future, coverUrl: null, photos: [], dateNote: null, tips: null });
    eventId = res.body.id;
  });

  it("período invertido dá 400 no campo endsAt", async () => {
    const res = await request(app)
      .post("/api/v1/events")
      .set("Authorization", `Bearer ${admin}`)
      .send({ ...future, endsAt: "2099-06-01T00:00:00.000Z" });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain("endsAt");
  });

  it("evento passado aparece só em scope=all", async () => {
    const created = await request(app).post("/api/v1/events").set("Authorization", `Bearer ${admin}`).send(past);
    expect(created.status).toBe(201);

    const upcoming = await request(app).get("/api/v1/events");
    expect(upcoming.body.map((e: { name: string }) => e.name)).toEqual(["Festival E2E"]);

    const all = await request(app).get("/api/v1/events?scope=all");
    expect(all.body.map((e: { name: string }) => e.name)).toEqual(["Evento passado E2E", "Festival E2E"]);
  });

  it("PUT /:id atualiza", async () => {
    const res = await request(app)
      .put(`/api/v1/events/${eventId}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ ...future, tips: "Leve agasalho" });
    expect(res.status).toBe(200);
    expect(res.body.tips).toBe("Leve agasalho");
  });

  it("upload vira capa e o arquivo é servido", async () => {
    const res = await request(app)
      .post(`/api/v1/events/${eventId}/photos`)
      .set("Authorization", `Bearer ${admin}`)
      .attach("file", PIXEL);
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/uploads\/events\/.+\.png$/);

    const detail = await request(app).get(`/api/v1/events/${eventId}`);
    expect(detail.body.coverUrl).toBe(res.body.url);

    const file = await request(app).get(res.body.url);
    expect(file.status).toBe(200);
  });

  it("DELETE /:id apaga o evento e a pasta", async () => {
    const dir = path.join(UPLOADS_DIR, "events", eventId);
    expect(existsSync(dir)).toBe(true);

    const del = await request(app).delete(`/api/v1/events/${eventId}`).set("Authorization", `Bearer ${admin}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/v1/events/${eventId}`)).status).toBe(404);
    expect(existsSync(dir)).toBe(false);
  });
});
