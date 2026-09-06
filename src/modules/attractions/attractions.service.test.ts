import { ZodError } from "zod";
import { NotFoundError } from "../../shared/errors/AppError";
import type { Cache } from "../../shared/cache/cache";
import type { PhotoManager } from "../../shared/photos/photos";
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
    guides: [],
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
  const photos = {
    add: jest.fn(),
    remove: jest.fn(),
    setCover: jest.fn(),
    removeAll: jest.fn(),
  } as unknown as jest.Mocked<PhotoManager>;
  const service = new AttractionsService(repo, cache, photos);
  return { repo, cache, photos, service };
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
    const { repo, cache, photos, service } = setup();
    repo.findById.mockResolvedValue(record());

    await service.remove("a1");

    expect(repo.delete).toHaveBeenCalledWith("a1");
    expect(photos.removeAll).toHaveBeenCalledWith("a1");
    expect(cache.del).toHaveBeenCalledWith("attractions:list:CACHOEIRA");
  });

  it("lança 404 se não existe", async () => {
    const { repo, service } = setup();
    repo.findById.mockResolvedValue(null);
    await expect(service.remove("x")).rejects.toThrow(NotFoundError);
  });
});

describe("AttractionsService fotos", () => {
  it("addPhoto delega ao manager com a atração carregada e invalida cache", async () => {
    const { repo, cache, photos, service } = setup();
    const existing = record();
    repo.findById.mockResolvedValue(existing);
    photos.add.mockResolvedValue({ id: "p1", url: "/uploads/attractions/a1/p1.jpg", position: 1 });

    const result = await service.addPhoto("a1", { buffer: Buffer.from("x"), ext: "jpg" });

    expect(photos.add).toHaveBeenCalledWith(existing, { buffer: Buffer.from("x"), ext: "jpg" });
    expect(result).toEqual({ id: "p1", url: "/uploads/attractions/a1/p1.jpg", position: 1 });
    expect(cache.del).toHaveBeenCalledWith("attractions:a1");
  });

  it("removePhoto delega ao manager e invalida cache", async () => {
    const { repo, cache, photos, service } = setup();
    const existing = record({ photos: [photo("p1", 1)] });
    repo.findById.mockResolvedValue(existing);

    await service.removePhoto("a1", "p1");

    expect(photos.remove).toHaveBeenCalledWith(existing, "p1");
    expect(cache.del).toHaveBeenCalledWith("attractions:a1");
  });

  it("setCover delega ao manager, invalida cache e devolve o detalhe atualizado", async () => {
    const { repo, cache, photos, service } = setup();
    const p1 = photo("p1", 1);
    const p2 = photo("p2", 2);
    const before = record({ coverPhotoId: "p1", coverPhoto: p1, photos: [p1, p2] });
    const after = record({ coverPhotoId: "p2", coverPhoto: p2, photos: [p1, p2] });
    repo.findById.mockResolvedValueOnce(before).mockResolvedValueOnce(after);

    const result = await service.setCover("a1", "p2");

    expect(photos.setCover).toHaveBeenCalledWith(before, "p2");
    expect(result.coverUrl).toBe("/uploads/attractions/a1/p2.jpg");
    expect(cache.del).toHaveBeenCalledWith("attractions:a1");
  });

  it("propaga 404 do manager", async () => {
    const { repo, photos, service } = setup();
    repo.findById.mockResolvedValue(record());
    photos.setCover.mockRejectedValue(new NotFoundError("Foto não encontrada"));
    await expect(service.setCover("a1", "p-outra")).rejects.toThrow(NotFoundError);
  });
});
