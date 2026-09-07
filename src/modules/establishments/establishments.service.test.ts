import { NotFoundError } from "../../shared/errors/AppError";
import type { Cache } from "../../shared/cache/cache";
import type { PhotoManager } from "../../shared/photos/photos";
import type { EstablishmentPhotoRecord, EstablishmentRecord, EstablishmentsRepository } from "./establishments.repository";
import { createEstablishmentSchema, establishmentFieldsSchema } from "./establishments.schemas";
import { EstablishmentsService } from "./establishments.service";

function photo(id: string, position: number, establishmentId = "s1"): EstablishmentPhotoRecord {
  return { id, establishmentId, url: `/uploads/establishments/${establishmentId}/${id}.jpg`, position, createdAt: new Date() };
}

function record(overrides: Partial<EstablishmentRecord> = {}): EstablishmentRecord {
  return {
    id: "s1",
    type: "RESTAURANTE",
    name: "Sabor da Serra",
    description: "Cozinha regional com vista para a serra.",
    latitude: -4.42,
    longitude: -41.46,
    address: "Rua Principal, 100",
    whatsapp: "5586999990000",
    instagram: null,
    openingHours: null,
    priceRange: "MEDIO",
    highlights: null,
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
  } as unknown as jest.Mocked<EstablishmentsRepository>;
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as unknown as jest.Mocked<Cache>;
  const photos = {
    add: jest.fn(),
    remove: jest.fn(),
    setCover: jest.fn(),
    removeAll: jest.fn(),
  } as unknown as jest.Mocked<PhotoManager>;
  const service = new EstablishmentsService(repo, cache, photos);
  return { repo, cache, photos, service };
}

const fields = {
  name: "Sabor da Serra",
  description: "Cozinha regional com vista para a serra.",
  latitude: -4.42,
  longitude: -41.46,
  address: "Rua Principal, 100",
  whatsapp: "5586999990000",
  priceRange: "MEDIO" as const,
};

describe("schemas de estabelecimento", () => {
  it("create exige type e normaliza contatos", () => {
    const parsed = createEstablishmentSchema.parse({ ...fields, type: "HOSPEDAGEM", whatsapp: "+55 (86) 99999-0000", instagram: "@pousada " });
    expect(parsed.type).toBe("HOSPEDAGEM");
    expect(parsed.whatsapp).toBe("5586999990000");
    expect(parsed.instagram).toBe("pousada");
  });

  it("fields rejeita type e chaves desconhecidas", () => {
    expect(establishmentFieldsSchema.safeParse({ ...fields, type: "RESTAURANTE" }).success).toBe(false);
    expect(establishmentFieldsSchema.safeParse({ ...fields, menu: "x" }).success).toBe(false);
  });

  it("rejeita priceRange fora do enum e endereço curto", () => {
    expect(establishmentFieldsSchema.safeParse({ ...fields, priceRange: "$$" }).success).toBe(false);
    expect(establishmentFieldsSchema.safeParse({ ...fields, address: "ab" }).success).toBe(false);
  });
});

describe("EstablishmentsService.list", () => {
  it("devolve do cache quando existe", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue([{ id: "x" }]);
    await expect(service.list("HOSPEDAGEM")).resolves.toEqual([{ id: "x" }]);
    expect(cache.get).toHaveBeenCalledWith("establishments:list:HOSPEDAGEM");
    expect(repo.findMany).not.toHaveBeenCalled();
  });

  it("busca, resume e grava no cache", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue(null);
    const cover = photo("p1", 1);
    repo.findMany.mockResolvedValue([record({ coverPhotoId: "p1", coverPhoto: cover, photos: [cover] })]);

    const result = await service.list();

    expect(repo.findMany).toHaveBeenCalledWith(undefined);
    expect(result).toEqual([
      {
        id: "s1",
        type: "RESTAURANTE",
        name: "Sabor da Serra",
        coverUrl: "/uploads/establishments/s1/p1.jpg",
        priceRange: "MEDIO",
        address: "Rua Principal, 100",
      },
    ]);
    expect(cache.set).toHaveBeenCalledWith("establishments:list:all", result);
  });
});

describe("EstablishmentsService.getById", () => {
  it("devolve detalhe com fotos e datas ISO, sem campos internos", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue(null);
    const p1 = photo("p1", 1);
    repo.findById.mockResolvedValue(record({ coverPhotoId: "p1", coverPhoto: p1, photos: [p1], highlights: "Música ao vivo" }));

    const result = await service.getById("s1");

    expect(result.photos).toEqual([{ id: "p1", url: "/uploads/establishments/s1/p1.jpg", position: 1 }]);
    expect(result.highlights).toBe("Música ao vivo");
    expect(result.whatsapp).toBe("5586999990000");
    expect(result.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result).not.toHaveProperty("coverPhoto");
    expect(cache.set).toHaveBeenCalledWith("establishments:s1", result);
  });

  it("lança 404 quando não existe", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue(null);
    repo.findById.mockResolvedValue(null);
    await expect(service.getById("x")).rejects.toThrow(NotFoundError);
  });
});

describe("EstablishmentsService.create e update", () => {
  it("create normaliza opcionais para null e invalida as três chaves", async () => {
    const { repo, cache, service } = setup();
    repo.create.mockResolvedValue(record());

    await service.create({ ...fields, type: "RESTAURANTE" });

    expect(repo.create).toHaveBeenCalledWith({
      ...fields,
      type: "RESTAURANTE",
      instagram: null,
      openingHours: null,
      highlights: null,
    });
    expect(cache.del).toHaveBeenCalledWith("establishments:list:all");
    expect(cache.del).toHaveBeenCalledWith("establishments:list:RESTAURANTE");
    expect(cache.del).toHaveBeenCalledWith("establishments:s1");
  });

  it("update mantém o tipo gravado e invalida", async () => {
    const { repo, cache, service } = setup();
    repo.findById.mockResolvedValue(record());
    repo.update.mockResolvedValue(record({ name: "Novo" }));

    const result = await service.update("s1", { ...fields, name: "Novo", openingHours: "11h às 22h" });

    expect(repo.update).toHaveBeenCalledWith("s1", {
      ...fields,
      name: "Novo",
      instagram: null,
      openingHours: "11h às 22h",
      highlights: null,
    });
    expect(result.name).toBe("Novo");
    expect(cache.del).toHaveBeenCalledWith("establishments:list:RESTAURANTE");
  });

  it("update de inexistente dá 404", async () => {
    const { repo, service } = setup();
    repo.findById.mockResolvedValue(null);
    await expect(service.update("x", fields)).rejects.toThrow(NotFoundError);
  });
});

describe("EstablishmentsService.remove e fotos", () => {
  it("remove apaga registro, pasta e invalida", async () => {
    const { repo, cache, photos, service } = setup();
    repo.findById.mockResolvedValue(record());

    await service.remove("s1");

    expect(repo.delete).toHaveBeenCalledWith("s1");
    expect(photos.removeAll).toHaveBeenCalledWith("s1");
    expect(cache.del).toHaveBeenCalledWith("establishments:list:all");
  });

  it("addPhoto, removePhoto e setCover delegam ao manager e invalidam", async () => {
    const { repo, cache, photos, service } = setup();
    const existing = record({ photos: [photo("p1", 1)] });
    repo.findById.mockResolvedValue(existing);
    photos.add.mockResolvedValue({ id: "p2", url: "/uploads/establishments/s1/p2.jpg", position: 2 });

    await expect(service.addPhoto("s1", { buffer: Buffer.from("x"), ext: "jpg" })).resolves.toEqual({
      id: "p2",
      url: "/uploads/establishments/s1/p2.jpg",
      position: 2,
    });
    expect(photos.add).toHaveBeenCalledWith(existing, { buffer: Buffer.from("x"), ext: "jpg" });

    await service.removePhoto("s1", "p1");
    expect(photos.remove).toHaveBeenCalledWith(existing, "p1");

    await service.setCover("s1", "p1");
    expect(photos.setCover).toHaveBeenCalledWith(existing, "p1");

    expect(cache.del).toHaveBeenCalledWith("establishments:s1");
  });
});
