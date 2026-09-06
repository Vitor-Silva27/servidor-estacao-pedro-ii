import { NotFoundError, ValidationError } from "../../shared/errors/AppError";
import type { Cache } from "../../shared/cache/cache";
import type { Storage } from "../../shared/storage/storage";
import type { AttractionsRepository } from "../attractions/attractions.repository";
import type { GuideRecord, GuidesRepository } from "./guides.repository";
import { guideSchema } from "./guides.schemas";
import { GuidesService } from "./guides.service";

function record(overrides: Partial<GuideRecord> = {}): GuideRecord {
  return {
    id: "g1",
    name: "João Lucas",
    description: null,
    whatsapp: "5586999990000",
    instagram: null,
    photoUrl: null,
    attractions: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function setup() {
  const repo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    setPhotoUrl: jest.fn(),
  } as unknown as jest.Mocked<GuidesRepository>;
  const attractions = { existingIds: jest.fn() } as unknown as jest.Mocked<AttractionsRepository>;
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as unknown as jest.Mocked<Cache>;
  const storage = { save: jest.fn(), remove: jest.fn(), removeDir: jest.fn() } as unknown as jest.Mocked<Storage>;
  const service = new GuidesService(repo, attractions, cache, storage);
  return { repo, attractions, cache, storage, service };
}

const input = {
  name: "João Lucas",
  whatsapp: "5586999990000",
  attractionIds: ["a1", "a2"],
};

describe("guideSchema", () => {
  const base = { name: "João", whatsapp: "+55 (86) 99999-0000", attractionIds: [] };

  it("normaliza o WhatsApp para só dígitos com DDI", () => {
    expect(guideSchema.parse(base).whatsapp).toBe("5586999990000");
  });

  it("rejeita WhatsApp sem DDI (11 dígitos)", () => {
    const result = guideSchema.safeParse({ ...base, whatsapp: "(86) 99999-0000" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["whatsapp"]);
  });

  it("normaliza o Instagram removendo @ e espaços", () => {
    expect(guideSchema.parse({ ...base, instagram: "@Joao.Lucas " }).instagram).toBe("Joao.Lucas");
  });

  it("rejeita Instagram com caractere inválido", () => {
    expect(guideSchema.safeParse({ ...base, instagram: "joao lucas!" }).success).toBe(false);
  });

  it("rejeita attractionIds repetidos e não-uuid", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(guideSchema.safeParse({ ...base, attractionIds: [id, id] }).success).toBe(false);
    expect(guideSchema.safeParse({ ...base, attractionIds: ["x"] }).success).toBe(false);
  });
});

describe("GuidesService.list e getById", () => {
  it("list resume com attractionIds e grava no cache", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue(null);
    repo.findMany.mockResolvedValue([record({ attractions: [{ id: "a1" }, { id: "a2" }] })]);

    const result = await service.list();

    expect(result).toEqual([
      {
        id: "g1",
        name: "João Lucas",
        description: null,
        whatsapp: "5586999990000",
        instagram: null,
        photoUrl: null,
        attractionIds: ["a1", "a2"],
      },
    ]);
    expect(cache.set).toHaveBeenCalledWith("guides:list", result);
  });

  it("getById devolve do cache quando existe e 404 quando não há registro", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValueOnce({ id: "cached" });
    await expect(service.getById("g1")).resolves.toEqual({ id: "cached" });

    cache.get.mockResolvedValueOnce(null);
    repo.findById.mockResolvedValue(null);
    await expect(service.getById("x")).rejects.toThrow(NotFoundError);
  });
});

describe("GuidesService.create", () => {
  it("valida atrações, cria com ligações e invalida guias e atrações ligadas", async () => {
    const { repo, attractions, cache, service } = setup();
    attractions.existingIds.mockResolvedValue(["a1", "a2"]);
    repo.create.mockResolvedValue(record({ attractions: [{ id: "a1" }, { id: "a2" }] }));

    const result = await service.create(input);

    expect(repo.create).toHaveBeenCalledWith(
      { name: "João Lucas", description: null, whatsapp: "5586999990000", instagram: null },
      ["a1", "a2"],
    );
    expect(result.attractionIds).toEqual(["a1", "a2"]);
    expect(cache.del).toHaveBeenCalledWith("guides:list");
    expect(cache.del).toHaveBeenCalledWith("guides:g1");
    expect(cache.del).toHaveBeenCalledWith("attractions:a1");
    expect(cache.del).toHaveBeenCalledWith("attractions:a2");
  });

  it("lança ValidationError em attractionIds quando alguma atração não existe", async () => {
    const { repo, attractions, service } = setup();
    attractions.existingIds.mockResolvedValue(["a1"]);

    await expect(service.create(input)).rejects.toMatchObject({
      name: "ValidationError",
      details: [{ path: "attractionIds", message: "Atração inexistente: a2" }],
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("não consulta atrações quando attractionIds é vazio", async () => {
    const { repo, attractions, service } = setup();
    repo.create.mockResolvedValue(record());
    await service.create({ ...input, attractionIds: [] });
    expect(attractions.existingIds).not.toHaveBeenCalled();
  });
});

describe("GuidesService.update", () => {
  it("substitui ligações e invalida as atrações antigas e novas", async () => {
    const { repo, attractions, cache, service } = setup();
    repo.findById.mockResolvedValue(record({ attractions: [{ id: "a1" }] }));
    attractions.existingIds.mockResolvedValue(["a3"]);
    repo.update.mockResolvedValue(record({ attractions: [{ id: "a3" }] }));

    const result = await service.update("g1", { ...input, attractionIds: ["a3"], instagram: "joao" });

    expect(repo.update).toHaveBeenCalledWith(
      "g1",
      { name: "João Lucas", description: null, whatsapp: "5586999990000", instagram: "joao" },
      ["a3"],
    );
    expect(result.attractionIds).toEqual(["a3"]);
    expect(cache.del).toHaveBeenCalledWith("attractions:a1");
    expect(cache.del).toHaveBeenCalledWith("attractions:a3");
  });

  it("404 se o guia não existe", async () => {
    const { repo, service } = setup();
    repo.findById.mockResolvedValue(null);
    await expect(service.update("x", input)).rejects.toThrow(NotFoundError);
  });
});

describe("GuidesService.setPhoto e remove", () => {
  it("setPhoto salva, apaga a foto anterior, grava a URL e invalida", async () => {
    const { repo, cache, storage, service } = setup();
    repo.findById.mockResolvedValue(record({ photoUrl: "/uploads/guides/g1/old.jpg", attractions: [{ id: "a1" }] }));
    storage.save.mockResolvedValue("/uploads/guides/g1/new.jpg");
    repo.setPhotoUrl.mockResolvedValue(record({ photoUrl: "/uploads/guides/g1/new.jpg" }));

    const result = await service.setPhoto("g1", { buffer: Buffer.from("x"), ext: "jpg" });

    expect(storage.save).toHaveBeenCalledWith("guides/g1", "jpg", Buffer.from("x"));
    expect(storage.remove).toHaveBeenCalledWith("/uploads/guides/g1/old.jpg");
    expect(repo.setPhotoUrl).toHaveBeenCalledWith("g1", "/uploads/guides/g1/new.jpg");
    expect(result.photoUrl).toBe("/uploads/guides/g1/new.jpg");
    expect(cache.del).toHaveBeenCalledWith("attractions:a1");
  });

  it("setPhoto sem foto anterior não chama remove", async () => {
    const { repo, storage, service } = setup();
    repo.findById.mockResolvedValue(record());
    storage.save.mockResolvedValue("/uploads/guides/g1/new.jpg");
    repo.setPhotoUrl.mockResolvedValue(record({ photoUrl: "/uploads/guides/g1/new.jpg" }));
    await service.setPhoto("g1", { buffer: Buffer.from("x"), ext: "jpg" });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("remove apaga o registro, a pasta e invalida", async () => {
    const { repo, cache, storage, service } = setup();
    repo.findById.mockResolvedValue(record({ attractions: [{ id: "a1" }] }));

    await service.remove("g1");

    expect(repo.delete).toHaveBeenCalledWith("g1");
    expect(storage.removeDir).toHaveBeenCalledWith("guides/g1");
    expect(cache.del).toHaveBeenCalledWith("guides:g1");
    expect(cache.del).toHaveBeenCalledWith("attractions:a1");
  });
});
