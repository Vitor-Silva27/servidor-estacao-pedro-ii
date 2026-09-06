import { ZodError } from "zod";
import { NotFoundError } from "../../shared/errors/AppError";
import type { Cache } from "../../shared/cache/cache";
import type { Storage } from "../../shared/storage/storage";
import type { AttractionRecord, AttractionsRepository, PhotoRecord } from "./attractions.repository";
import { AttractionsService } from "./attractions.service";

function photo(id: string, position: number, attractionId = "a1"): PhotoRecord {
  return { id, attractionId, url: `/uploads/attractions/${attractionId}/${id}.jpg`, position, createdAt: new Date() };
}

function record(overrides: Partial<AttractionRecord> = {}): AttractionRecord {
  return {
    id: "a1",
    type: "CACHOEIRA",
    name: "Salto Liso",
    description: "Queda d'água de 30 metros com piscina natural.",
    latitude: -4.4,
    longitude: -41.4,
    tips: null,
    howToGet: null,
    trailDistance: "2km",
    trailTime: "30min",
    trailLevel: "MEDIA",
    openingHours: null,
    price: null,
    coverPhotoId: null,
    coverPhoto: null,
    photos: [],
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
    addPhoto: jest.fn(),
    deletePhoto: jest.fn(),
    setCover: jest.fn(),
  } as unknown as jest.Mocked<AttractionsRepository>;
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as unknown as jest.Mocked<Cache>;
  const storage = { save: jest.fn(), remove: jest.fn(), removeDir: jest.fn() } as unknown as jest.Mocked<Storage>;
  const service = new AttractionsService(repo, cache, storage);
  return { repo, cache, storage, service };
}

const waterfallInput = {
  type: "CACHOEIRA" as const,
  name: "Salto Liso",
  description: "Queda d'água de 30 metros com piscina natural.",
  latitude: -4.4,
  longitude: -41.4,
  trailDistance: "2km",
  trailTime: "30min",
  trailLevel: "MEDIA" as const,
};

describe("AttractionsService.list", () => {
  it("devolve do cache quando existe", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue([{ id: "x" }]);
    await expect(service.list("CACHOEIRA")).resolves.toEqual([{ id: "x" }]);
    expect(cache.get).toHaveBeenCalledWith("attractions:list:CACHOEIRA");
    expect(repo.findMany).not.toHaveBeenCalled();
  });

  it("busca no repo, resume e grava no cache quando não há valor", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue(null);
    const cover = photo("p1", 1);
    repo.findMany.mockResolvedValue([record({ coverPhotoId: "p1", coverPhoto: cover, photos: [cover] })]);

    const result = await service.list();

    expect(repo.findMany).toHaveBeenCalledWith(undefined);
    expect(result).toEqual([
      {
        id: "a1",
        type: "CACHOEIRA",
        name: "Salto Liso",
        coverUrl: "/uploads/attractions/a1/p1.jpg",
        trailDistance: "2km",
        trailTime: "30min",
        trailLevel: "MEDIA",
      },
    ]);
    expect(cache.set).toHaveBeenCalledWith("attractions:list:all", result);
  });
});

describe("AttractionsService.getById", () => {
  it("devolve detalhe com photos ordenadas e datas em ISO, e grava no cache", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue(null);
    const p1 = photo("p1", 1);
    const p2 = photo("p2", 2);
    repo.findById.mockResolvedValue(record({ coverPhotoId: "p2", coverPhoto: p2, photos: [p1, p2] }));

    const result = await service.getById("a1");

    expect(result.coverUrl).toBe("/uploads/attractions/a1/p2.jpg");
    expect(result.photos).toEqual([
      { id: "p1", url: "/uploads/attractions/a1/p1.jpg", position: 1 },
      { id: "p2", url: "/uploads/attractions/a1/p2.jpg", position: 2 },
    ]);
    expect(result.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result).not.toHaveProperty("coverPhoto");
    expect(result).not.toHaveProperty("coverPhotoId");
    expect(cache.set).toHaveBeenCalledWith("attractions:a1", result);
  });

  it("lança 404 quando não existe", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue(null);
    repo.findById.mockResolvedValue(null);
    await expect(service.getById("nada")).rejects.toThrow(NotFoundError);
  });
});

describe("AttractionsService.create", () => {
  it("normaliza opcionais para null, cria e invalida cache", async () => {
    const { repo, cache, service } = setup();
    repo.create.mockResolvedValue(record());

    await service.create(waterfallInput);

    expect(repo.create).toHaveBeenCalledWith({
      ...waterfallInput,
      tips: null,
      howToGet: null,
      openingHours: null,
      price: null,
    });
    expect(cache.del).toHaveBeenCalledWith("attractions:list:all");
    expect(cache.del).toHaveBeenCalledWith("attractions:list:CACHOEIRA");
    expect(cache.del).toHaveBeenCalledWith("attractions:a1");
  });
});

describe("AttractionsService.update", () => {
  it("valida contra o tipo gravado: cachoeira sem trilha falha", async () => {
    const { repo, service } = setup();
    repo.findById.mockResolvedValue(record());
    const { trailDistance, trailTime, trailLevel, type, ...semTrilha } = waterfallInput;
    await expect(service.update("a1", semTrilha)).rejects.toThrow(ZodError);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("ponto turístico com campos de trilha falha", async () => {
    const { repo, service } = setup();
    repo.findById.mockResolvedValue(record({ type: "PONTO_TURISTICO", trailDistance: null, trailTime: null, trailLevel: null }));
    const { type, ...comTrilha } = waterfallInput;
    await expect(service.update("a1", comTrilha)).rejects.toThrow(ZodError);
  });

  it("atualiza e invalida cache", async () => {
    const { repo, cache, service } = setup();
    repo.findById.mockResolvedValue(record());
    repo.update.mockResolvedValue(record({ name: "Novo" }));
    const { type, ...fields } = waterfallInput;

    const result = await service.update("a1", { ...fields, name: "Novo", tips: "Leve água" });

    expect(repo.update).toHaveBeenCalledWith("a1", {
      ...fields,
      name: "Novo",
      tips: "Leve água",
      howToGet: null,
      openingHours: null,
      price: null,
    });
    expect(result.name).toBe("Novo");
    expect(cache.del).toHaveBeenCalledWith("attractions:a1");
  });
});

describe("AttractionsService.remove", () => {
  it("apaga registro, pasta de arquivos e invalida cache", async () => {
    const { repo, cache, storage, service } = setup();
    repo.findById.mockResolvedValue(record());

    await service.remove("a1");

    expect(repo.delete).toHaveBeenCalledWith("a1");
    expect(storage.removeDir).toHaveBeenCalledWith("attractions/a1");
    expect(cache.del).toHaveBeenCalledWith("attractions:list:CACHOEIRA");
  });

  it("lança 404 se não existe", async () => {
    const { repo, service } = setup();
    repo.findById.mockResolvedValue(null);
    await expect(service.remove("x")).rejects.toThrow(NotFoundError);
  });
});

describe("AttractionsService.addPhoto", () => {
  it("salva no storage, cria a foto e a define como capa quando não havia", async () => {
    const { repo, cache, storage, service } = setup();
    repo.findById.mockResolvedValue(record());
    storage.save.mockResolvedValue("/uploads/attractions/a1/p1.jpg");
    repo.addPhoto.mockResolvedValue(photo("p1", 1));

    const result = await service.addPhoto("a1", { buffer: Buffer.from("x"), ext: "jpg" });

    expect(storage.save).toHaveBeenCalledWith("attractions/a1", "jpg", Buffer.from("x"));
    expect(repo.addPhoto).toHaveBeenCalledWith("a1", "/uploads/attractions/a1/p1.jpg");
    expect(repo.setCover).toHaveBeenCalledWith("a1", "p1");
    expect(result).toEqual({ id: "p1", url: "/uploads/attractions/a1/p1.jpg", position: 1 });
    expect(cache.del).toHaveBeenCalledWith("attractions:a1");
  });

  it("não mexe na capa quando já existe", async () => {
    const { repo, storage, service } = setup();
    const p1 = photo("p1", 1);
    repo.findById.mockResolvedValue(record({ coverPhotoId: "p1", coverPhoto: p1, photos: [p1] }));
    storage.save.mockResolvedValue("/uploads/attractions/a1/p2.jpg");
    repo.addPhoto.mockResolvedValue(photo("p2", 2));

    await service.addPhoto("a1", { buffer: Buffer.from("x"), ext: "jpg" });

    expect(repo.setCover).not.toHaveBeenCalled();
  });
});

describe("AttractionsService.removePhoto", () => {
  it("ao apagar a capa, promove a foto de menor posição restante", async () => {
    const { repo, storage, service } = setup();
    const p1 = photo("p1", 1);
    const p2 = photo("p2", 2);
    const p3 = photo("p3", 3);
    repo.findById.mockResolvedValue(record({ coverPhotoId: "p2", coverPhoto: p2, photos: [p1, p2, p3] }));

    await service.removePhoto("a1", "p2");

    expect(repo.setCover).toHaveBeenCalledWith("a1", "p1");
    expect(repo.deletePhoto).toHaveBeenCalledWith("p2");
    expect(storage.remove).toHaveBeenCalledWith("/uploads/attractions/a1/p2.jpg");
  });

  it("ao apagar a última foto, a capa fica null", async () => {
    const { repo, service } = setup();
    const p1 = photo("p1", 1);
    repo.findById.mockResolvedValue(record({ coverPhotoId: "p1", coverPhoto: p1, photos: [p1] }));

    await service.removePhoto("a1", "p1");

    expect(repo.setCover).toHaveBeenCalledWith("a1", null);
  });

  it("não mexe na capa ao apagar outra foto", async () => {
    const { repo, service } = setup();
    const p1 = photo("p1", 1);
    const p2 = photo("p2", 2);
    repo.findById.mockResolvedValue(record({ coverPhotoId: "p1", coverPhoto: p1, photos: [p1, p2] }));

    await service.removePhoto("a1", "p2");

    expect(repo.setCover).not.toHaveBeenCalled();
    expect(repo.deletePhoto).toHaveBeenCalledWith("p2");
  });

  it("lança 404 se a foto não pertence à atração", async () => {
    const { repo, service } = setup();
    repo.findById.mockResolvedValue(record({ photos: [photo("p1", 1)] }));
    await expect(service.removePhoto("a1", "p9")).rejects.toThrow(NotFoundError);
    expect(repo.deletePhoto).not.toHaveBeenCalled();
  });
});

describe("AttractionsService.setCover", () => {
  it("define a capa e invalida cache", async () => {
    const { repo, cache, service } = setup();
    const p1 = photo("p1", 1);
    const p2 = photo("p2", 2);
    repo.findById.mockResolvedValue(record({ coverPhotoId: "p1", coverPhoto: p1, photos: [p1, p2] }));
    repo.setCover.mockResolvedValue(record({ coverPhotoId: "p2", coverPhoto: p2, photos: [p1, p2] }));

    const result = await service.setCover("a1", "p2");

    expect(repo.setCover).toHaveBeenCalledWith("a1", "p2");
    expect(result.coverUrl).toBe("/uploads/attractions/a1/p2.jpg");
    expect(cache.del).toHaveBeenCalledWith("attractions:a1");
  });

  it("lança 404 com foto de outra atração", async () => {
    const { repo, service } = setup();
    repo.findById.mockResolvedValue(record({ photos: [photo("p1", 1)] }));
    await expect(service.setCover("a1", "p-outra")).rejects.toThrow(NotFoundError);
    expect(repo.setCover).not.toHaveBeenCalled();
  });
});
