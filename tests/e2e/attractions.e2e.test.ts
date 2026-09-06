import { existsSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { createApp } from "../../src/app";
import { UPLOADS_DIR } from "../../src/config/paths";
import { loginAs } from "./helpers/users";

const app = createApp();
const PIXEL = path.join(__dirname, "fixtures/pixel.png");

const waterfall = {
  type: "CACHOEIRA",
  name: "Cachoeira E2E",
  description: "Uma cachoeira criada pelos testes de ponta a ponta.",
  latitude: -4.4,
  longitude: -41.4,
  trailDistance: "2km",
  trailTime: "30min",
  trailLevel: "MEDIA",
};

const place = {
  type: "PONTO_TURISTICO",
  name: "Mirante E2E",
  description: "Um mirante criado pelos testes de ponta a ponta.",
  latitude: -4.3,
  longitude: -41.4,
  openingHours: "08:00 às 17:00",
};

describe("atrações", () => {
  let admin: string;
  let tourist: string;
  let waterfallId: string;
  let firstPhotoId: string;
  let secondPhotoId: string;

  beforeAll(async () => {
    admin = await loginAs(app, "ADMIN");
    tourist = await loginAs(app, "TOURIST");
  });

  it("GET / é público e começa vazio", async () => {
    const res = await request(app).get("/api/v1/attractions");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("POST / sem token dá 401 e com turista dá 403", async () => {
    expect((await request(app).post("/api/v1/attractions").send(waterfall)).status).toBe(401);
    const res = await request(app)
      .post("/api/v1/attractions")
      .set("Authorization", `Bearer ${tourist}`)
      .send(waterfall);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("admin cria cachoeira e ponto turístico", async () => {
    const w = await request(app)
      .post("/api/v1/attractions")
      .set("Authorization", `Bearer ${admin}`)
      .send(waterfall);
    expect(w.status).toBe(201);
    expect(w.body).toMatchObject({ ...waterfall, coverUrl: null, photos: [], tips: null });
    waterfallId = w.body.id;

    const p = await request(app)
      .post("/api/v1/attractions")
      .set("Authorization", `Bearer ${admin}`)
      .send(place);
    expect(p.status).toBe(201);
    expect(p.body.price).toBeNull();
  });

  it("cachoeira sem campos de trilha dá 400 com details", async () => {
    const { trailDistance, trailTime, trailLevel, ...invalid } = waterfall;
    const res = await request(app)
      .post("/api/v1/attractions")
      .set("Authorization", `Bearer ${admin}`)
      .send(invalid);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["trailDistance", "trailTime", "trailLevel"]));
  });

  it("GET /?type=CACHOEIRA devolve só a cachoeira (cache invalidado após criação)", async () => {
    const res = await request(app).get("/api/v1/attractions?type=CACHOEIRA");
    expect(res.status).toBe(200);
    expect(res.body.map((a: { name: string }) => a.name)).toEqual(["Cachoeira E2E"]);
    const all = await request(app).get("/api/v1/attractions");
    expect(all.body).toHaveLength(2);
  });

  it("PUT /:id atualiza e rejeita campo do outro tipo", async () => {
    const { type, ...fields } = waterfall;
    const ok = await request(app)
      .put(`/api/v1/attractions/${waterfallId}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ ...fields, name: "Cachoeira E2E editada", tips: "Leve água" });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe("Cachoeira E2E editada");
    expect(ok.body.tips).toBe("Leve água");

    const bad = await request(app)
      .put(`/api/v1/attractions/${waterfallId}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ ...fields, price: "R$ 10" });
    expect(bad.status).toBe(400);
  });

  it("upload da primeira foto vira capa e o arquivo é servido", async () => {
    const res = await request(app)
      .post(`/api/v1/attractions/${waterfallId}/photos`)
      .set("Authorization", `Bearer ${admin}`)
      .attach("file", PIXEL);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ position: 1, url: expect.stringMatching(/^\/uploads\/attractions\/.+\.png$/) });
    firstPhotoId = res.body.id;

    const detail = await request(app).get(`/api/v1/attractions/${waterfallId}`);
    expect(detail.body.coverUrl).toBe(res.body.url);

    const file = await request(app).get(res.body.url);
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toContain("image/png");
  });

  it("upload sem arquivo e com tipo inválido dão 400", async () => {
    const none = await request(app)
      .post(`/api/v1/attractions/${waterfallId}/photos`)
      .set("Authorization", `Bearer ${admin}`);
    expect(none.status).toBe(400);
    expect(none.body.error.details[0].path).toBe("file");

    const txt = await request(app)
      .post(`/api/v1/attractions/${waterfallId}/photos`)
      .set("Authorization", `Bearer ${admin}`)
      .attach("file", Buffer.from("nao sou imagem"), { filename: "x.txt", contentType: "text/plain" });
    expect(txt.status).toBe(400);
  });

  it("segunda foto não muda a capa; PUT /cover troca", async () => {
    const res = await request(app)
      .post(`/api/v1/attractions/${waterfallId}/photos`)
      .set("Authorization", `Bearer ${admin}`)
      .attach("file", PIXEL);
    expect(res.status).toBe(201);
    expect(res.body.position).toBe(2);
    secondPhotoId = res.body.id;

    const before = await request(app).get(`/api/v1/attractions/${waterfallId}`);
    expect(before.body.photos).toHaveLength(2);

    const cover = await request(app)
      .put(`/api/v1/attractions/${waterfallId}/cover`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ photoId: secondPhotoId });
    expect(cover.status).toBe(200);
    expect(cover.body.coverUrl).toBe(res.body.url);
  });

  it("DELETE da capa promove a outra foto", async () => {
    const del = await request(app)
      .delete(`/api/v1/attractions/${waterfallId}/photos/${secondPhotoId}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(del.status).toBe(204);

    const detail = await request(app).get(`/api/v1/attractions/${waterfallId}`);
    expect(detail.body.photos).toHaveLength(1);
    expect(detail.body.photos[0].id).toBe(firstPhotoId);
    expect(detail.body.coverUrl).toBe(detail.body.photos[0].url);
  });

  it("DELETE /:id apaga a atração e a pasta de uploads", async () => {
    const dir = path.join(UPLOADS_DIR, "attractions", waterfallId);
    expect(existsSync(dir)).toBe(true);

    const del = await request(app)
      .delete(`/api/v1/attractions/${waterfallId}`)
      .set("Authorization", `Bearer ${admin}`);
    expect(del.status).toBe(204);

    expect((await request(app).get(`/api/v1/attractions/${waterfallId}`)).status).toBe(404);
    expect(existsSync(dir)).toBe(false);
  });
});
