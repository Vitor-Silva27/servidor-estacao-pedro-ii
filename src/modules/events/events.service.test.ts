import { NotFoundError } from "../../shared/errors/AppError";
import type { Cache } from "../../shared/cache/cache";
import type { PhotoManager } from "../../shared/photos/photos";
import type { EventPhotoRecord, EventRecord, EventsRepository } from "./events.repository";
import { eventSchema } from "./events.schemas";
import { EventsService } from "./events.service";

const NOW = new Date("2026-09-06T12:00:00Z");

function photo(id: string, position: number, eventId = "e1"): EventPhotoRecord {
  return { id, eventId, url: `/uploads/events/${eventId}/${id}.jpg`, position, createdAt: new Date() };
}

function record(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "e1",
    name: "Festival de Inverno",
    description: "Música, arte e gastronomia na serra.",
    startsAt: new Date("2027-07-01T03:00:00Z"),
    endsAt: new Date("2027-08-01T02:59:59Z"),
    dateNote: null,
    latitude: -4.42,
    longitude: -41.46,
    address: null,
    tips: null,
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
  } as unknown as jest.Mocked<EventsRepository>;
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as unknown as jest.Mocked<Cache>;
  const photos = {
    add: jest.fn(),
    remove: jest.fn(),
    setCover: jest.fn(),
    removeAll: jest.fn(),
  } as unknown as jest.Mocked<PhotoManager>;
  const service = new EventsService(repo, cache, photos, () => NOW);
  return { repo, cache, photos, service };
}

const input = {
  name: "Festival de Inverno",
  description: "Música, arte e gastronomia na serra.",
  startsAt: new Date("2027-07-01T03:00:00Z"),
  endsAt: new Date("2027-08-01T02:59:59Z"),
  latitude: -4.42,
  longitude: -41.46,
};

describe("eventSchema", () => {
  const body = {
    name: "Festival",
    description: "Descrição com mais de dez letras.",
    startsAt: "2027-07-01T00:00:00.000Z",
    endsAt: "2027-07-31T23:59:59.000Z",
    latitude: -4.42,
    longitude: -41.46,
  };

  it("converte datas ISO para Date", () => {
    const parsed = eventSchema.parse(body);
    expect(parsed.startsAt).toBeInstanceOf(Date);
    expect(parsed.endsAt.toISOString()).toBe("2027-07-31T23:59:59.000Z");
  });

  it("rejeita fim antes do início no campo endsAt", () => {
    const result = eventSchema.safeParse({ ...body, endsAt: "2027-06-30T00:00:00.000Z" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["endsAt"]);
  });

  it("rejeita chave desconhecida", () => {
    expect(eventSchema.safeParse({ ...body, price: "x" }).success).toBe(false);
  });
});

describe("EventsService.list", () => {
  it("upcoming passa o relógio ao repo e resume", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue(null);
    const cover = photo("p1", 1);
    repo.findMany.mockResolvedValue([record({ coverPhotoId: "p1", coverPhoto: cover, photos: [cover], address: "Centro" })]);

    const result = await service.list("upcoming");

    expect(repo.findMany).toHaveBeenCalledWith("upcoming", NOW);
    expect(result).toEqual([
      {
        id: "e1",
        name: "Festival de Inverno",
        coverUrl: "/uploads/events/e1/p1.jpg",
        startsAt: "2027-07-01T03:00:00.000Z",
        endsAt: "2027-08-01T02:59:59.000Z",
        dateNote: null,
        address: "Centro",
      },
    ]);
    expect(cache.set).toHaveBeenCalledWith("events:list:upcoming", result);
  });

  it("all usa a chave própria e devolve do cache quando existe", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue([{ id: "x" }]);
    await expect(service.list("all")).resolves.toEqual([{ id: "x" }]);
    expect(cache.get).toHaveBeenCalledWith("events:list:all");
    expect(repo.findMany).not.toHaveBeenCalled();
  });

  it("sem argumento é upcoming", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue(null);
    repo.findMany.mockResolvedValue([]);
    await service.list();
    expect(repo.findMany).toHaveBeenCalledWith("upcoming", NOW);
  });
});

describe("EventsService.getById", () => {
  it("devolve detalhe com datas ISO e fotos, e grava no cache", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue(null);
    const p1 = photo("p1", 1);
    repo.findById.mockResolvedValue(record({ coverPhotoId: "p1", coverPhoto: p1, photos: [p1], tips: "Leve agasalho" }));

    const result = await service.getById("e1");

    expect(result.photos).toEqual([{ id: "p1", url: "/uploads/events/e1/p1.jpg", position: 1 }]);
    expect(result.tips).toBe("Leve agasalho");
    expect(result.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result).not.toHaveProperty("coverPhoto");
    expect(cache.set).toHaveBeenCalledWith("events:e1", result);
  });

  it("lança 404 quando não existe", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue(null);
    repo.findById.mockResolvedValue(null);
    await expect(service.getById("x")).rejects.toThrow(NotFoundError);
  });
});

describe("EventsService.create e update", () => {
  it("create normaliza opcionais para null e invalida as três chaves", async () => {
    const { repo, cache, service } = setup();
    repo.create.mockResolvedValue(record());

    await service.create(input);

    expect(repo.create).toHaveBeenCalledWith({ ...input, dateNote: null, address: null, tips: null });
    expect(cache.del).toHaveBeenCalledWith("events:list:upcoming");
    expect(cache.del).toHaveBeenCalledWith("events:list:all");
    expect(cache.del).toHaveBeenCalledWith("events:e1");
  });

  it("update exige que exista e invalida", async () => {
    const { repo, cache, service } = setup();
    repo.findById.mockResolvedValue(record());
    repo.update.mockResolvedValue(record({ name: "Novo" }));

    const result = await service.update("e1", { ...input, address: "Praça" });

    expect(repo.update).toHaveBeenCalledWith("e1", { ...input, dateNote: null, address: "Praça", tips: null });
    expect(result.name).toBe("Novo");
    expect(cache.del).toHaveBeenCalledWith("events:e1");
  });

  it("update de inexistente dá 404", async () => {
    const { repo, service } = setup();
    repo.findById.mockResolvedValue(null);
    await expect(service.update("x", input)).rejects.toThrow(NotFoundError);
  });
});

describe("EventsService.remove e fotos", () => {
  it("remove apaga registro, pasta e invalida", async () => {
    const { repo, cache, photos, service } = setup();
    repo.findById.mockResolvedValue(record());

    await service.remove("e1");

    expect(repo.delete).toHaveBeenCalledWith("e1");
    expect(photos.removeAll).toHaveBeenCalledWith("e1");
    expect(cache.del).toHaveBeenCalledWith("events:list:all");
  });

  it("addPhoto, removePhoto e setCover delegam ao manager e invalidam", async () => {
    const { repo, cache, photos, service } = setup();
    const existing = record({ photos: [photo("p1", 1)] });
    repo.findById.mockResolvedValue(existing);
    photos.add.mockResolvedValue({ id: "p2", url: "/uploads/events/e1/p2.jpg", position: 2 });

    await expect(service.addPhoto("e1", { buffer: Buffer.from("x"), ext: "jpg" })).resolves.toEqual({
      id: "p2",
      url: "/uploads/events/e1/p2.jpg",
      position: 2,
    });
    expect(photos.add).toHaveBeenCalledWith(existing, { buffer: Buffer.from("x"), ext: "jpg" });

    await service.removePhoto("e1", "p1");
    expect(photos.remove).toHaveBeenCalledWith(existing, "p1");

    await service.setCover("e1", "p1");
    expect(photos.setCover).toHaveBeenCalledWith(existing, "p1");

    expect(cache.del).toHaveBeenCalledWith("events:e1");
  });
});
