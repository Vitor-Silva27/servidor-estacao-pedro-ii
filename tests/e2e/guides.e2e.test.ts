import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { createApp } from "../../src/app";
import { UPLOADS_DIR } from "../../src/config/paths";
import { loginAs } from "./helpers/users";

const app = createApp();
const PIXEL = path.join(__dirname, "fixtures/pixel.png");

const attraction = (name: string) => ({
  type: "PONTO_TURISTICO",
  name,
  description: `Ponto turístico ${name} criado pelos testes.`,
  latitude: -4.4,
  longitude: -41.4,
});

describe("guias", () => {
  let admin: string;
  let tourist: string;
  let a1: string;
  let a2: string;
  let guideId: string;

  beforeAll(async () => {
    admin = await loginAs(app, "ADMIN");
    tourist = await loginAs(app, "TOURIST");
    const auth = { Authorization: `Bearer ${admin}` };
    a1 = (await request(app).post("/api/v1/attractions").set(auth).send(attraction("Mirante A"))).body.id;
    a2 = (await request(app).post("/api/v1/attractions").set(auth).send(attraction("Mirante B"))).body.id;
  });

  it("GET / é público e começa vazio", async () => {
    const res = await request(app).get("/api/v1/guides");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("POST / sem token dá 401 e com turista dá 403", async () => {
    const body = { name: "João", whatsapp: "5586999990000", attractionIds: [] };
    expect((await request(app).post("/api/v1/guides").send(body)).status).toBe(401);
    expect((await request(app).post("/api/v1/guides").set("Authorization", `Bearer ${tourist}`).send(body)).status).toBe(403);
  });

  it("admin cria guia com máscara no WhatsApp, ligado à primeira atração", async () => {
    const res = await request(app)
      .post("/api/v1/guides")
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "João Lucas", whatsapp: "+55 (86) 99999-0000", instagram: "@joao.lucas", attractionIds: [a1] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "João Lucas",
      whatsapp: "5586999990000",
      instagram: "joao.lucas",
      photoUrl: null,
      attractionIds: [a1],
    });
    guideId = res.body.id;
  });

  it("o detalhe da primeira atração traz o guia e o da segunda não", async () => {
    const d1 = await request(app).get(`/api/v1/attractions/${a1}`);
    expect(d1.body.guides).toEqual([
      { id: guideId, name: "João Lucas", description: null, whatsapp: "5586999990000", instagram: "joao.lucas", photoUrl: null },
    ]);
    const d2 = await request(app).get(`/api/v1/attractions/${a2}`);
    expect(d2.body.guides).toEqual([]);
  });

  it("PUT trocando a ligação inverte os detalhes", async () => {
    const res = await request(app)
      .put(`/api/v1/guides/${guideId}`)
      .set("Authorization", `Bearer ${admin}`)
      .send({ name: "João Lucas", whatsapp: "5586999990000", attractionIds: [a2] });
    expect(res.status).toBe(200);
    expect(res.body.attractionIds).toEqual([a2]);
    expect(res.body.instagram).toBeNull();

    expect((await request(app).get(`/api/v1/attractions/${a1}`)).body.guides).toEqual([]);
    expect((await request(app).get(`/api/v1/attractions/${a2}`)).body.guides).toHaveLength(1);
  });

  it("WhatsApp sem DDI e attractionIds inexistente dão 400 no campo certo", async () => {
    const auth = { Authorization: `Bearer ${admin}` };
    const bad = await request(app).post("/api/v1/guides").set(auth).send({ name: "X Y", whatsapp: "(86) 99999-0000", attractionIds: [] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe("whatsapp");

    const ghost = "11111111-1111-4111-8111-111111111111";
    const missing = await request(app).post("/api/v1/guides").set(auth).send({ name: "X Y", whatsapp: "5586999990000", attractionIds: [ghost] });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details).toEqual([{ path: "attractionIds", message: `Atração inexistente: ${ghost}` }]);
  });

  it("upload duas vezes deixa só a segunda foto em disco", async () => {
    const auth = { Authorization: `Bearer ${admin}` };
    const first = await request(app).post(`/api/v1/guides/${guideId}/photo`).set(auth).attach("file", PIXEL);
    expect(first.status).toBe(200);
    expect(first.body.photoUrl).toMatch(/^\/uploads\/guides\/.+\.png$/);

    const second = await request(app).post(`/api/v1/guides/${guideId}/photo`).set(auth).attach("file", PIXEL);
    expect(second.body.photoUrl).not.toBe(first.body.photoUrl);

    const dir = path.join(UPLOADS_DIR, "guides", guideId);
    expect(readdirSync(dir)).toHaveLength(1);
    expect((await request(app).get(second.body.photoUrl)).status).toBe(200);
    expect((await request(app).get(`/api/v1/attractions/${a2}`)).body.guides[0].photoUrl).toBe(second.body.photoUrl);
  });

  it("DELETE remove o guia, a pasta e ele some do detalhe da atração", async () => {
    const dir = path.join(UPLOADS_DIR, "guides", guideId);
    const res = await request(app).delete(`/api/v1/guides/${guideId}`).set("Authorization", `Bearer ${admin}`);
    expect(res.status).toBe(204);
    expect((await request(app).get(`/api/v1/guides/${guideId}`)).status).toBe(404);
    expect(existsSync(dir)).toBe(false);
    expect((await request(app).get(`/api/v1/attractions/${a2}`)).body.guides).toEqual([]);
  });
});
