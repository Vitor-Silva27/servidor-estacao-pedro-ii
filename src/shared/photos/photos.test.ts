import { NotFoundError } from "../errors/AppError";
import type { Storage } from "../storage/storage";
import {
  createPhotoManager,
  photoUploadBodySchema,
  updatePhotoSchema,
  type PhotoOwner,
  type PhotoRepository,
  type PhotoRow,
} from "./photos";

function photo(id: string, position: number): PhotoRow {
  return { id, url: `/uploads/things/o1/${id}.jpg`, credit: null, position };
}

function owner(overrides: Partial<PhotoOwner> = {}): PhotoOwner {
  return { id: "o1", coverPhotoId: null, photos: [], ...overrides };
}

function setup() {
  const repo = {
    addPhoto: jest.fn(),
    updatePhotoCredit: jest.fn(),
    deletePhoto: jest.fn(),
    setCover: jest.fn(),
  } as unknown as jest.Mocked<PhotoRepository>;
  const storage = { save: jest.fn(), remove: jest.fn(), removeDir: jest.fn() } as unknown as jest.Mocked<Storage>;
  const manager = createPhotoManager(repo, storage, (id) => `things/${id}`);
  return { repo, storage, manager };
}

describe("photoManager.add", () => {
  it("salva no storage, cria a foto e a define como capa quando não havia", async () => {
    const { repo, storage, manager } = setup();
    storage.save.mockResolvedValue("/uploads/things/o1/p1.jpg");
    repo.addPhoto.mockResolvedValue(photo("p1", 1));

    const result = await manager.add(owner(), { buffer: Buffer.from("x"), ext: "jpg" });

    expect(storage.save).toHaveBeenCalledWith("things/o1", "jpg", Buffer.from("x"));
    expect(repo.addPhoto).toHaveBeenCalledWith("o1", "/uploads/things/o1/p1.jpg", null);
    expect(repo.setCover).toHaveBeenCalledWith("o1", "p1");
    expect(result).toEqual({ id: "p1", url: "/uploads/things/o1/p1.jpg", credit: null, position: 1 });
  });

  it("não mexe na capa quando já existe", async () => {
    const { repo, storage, manager } = setup();
    storage.save.mockResolvedValue("/uploads/things/o1/p2.jpg");
    repo.addPhoto.mockResolvedValue(photo("p2", 2));

    await manager.add(owner({ coverPhotoId: "p1", photos: [photo("p1", 1)] }), { buffer: Buffer.from("x"), ext: "jpg" });

    expect(repo.setCover).not.toHaveBeenCalled();
  });

  it("grava o crédito informado", async () => {
    const { repo, storage, manager } = setup();
    storage.save.mockResolvedValue("/uploads/things/o1/p1.jpg");
    repo.addPhoto.mockResolvedValue({ ...photo("p1", 1), credit: "Maria Souza" });

    const result = await manager.add(owner(), { buffer: Buffer.from("x"), ext: "jpg", credit: "Maria Souza" });

    expect(repo.addPhoto).toHaveBeenCalledWith("o1", "/uploads/things/o1/p1.jpg", "Maria Souza");
    expect(result.credit).toBe("Maria Souza");
  });
});

describe("photoManager.setCredit", () => {
  it("atualiza o crédito de uma foto do dono", async () => {
    const { repo, manager } = setup();
    repo.updatePhotoCredit.mockResolvedValue({ ...photo("p1", 1), credit: "João" });

    const result = await manager.setCredit(owner({ photos: [photo("p1", 1)] }), "p1", "João");

    expect(repo.updatePhotoCredit).toHaveBeenCalledWith("p1", "João");
    expect(result).toEqual({ id: "p1", url: "/uploads/things/o1/p1.jpg", credit: "João", position: 1 });
  });

  it("lança 404 com foto de outro dono", async () => {
    const { repo, manager } = setup();
    await expect(manager.setCredit(owner({ photos: [photo("p1", 1)] }), "p9", "João")).rejects.toThrow(NotFoundError);
    expect(repo.updatePhotoCredit).not.toHaveBeenCalled();
  });
});

describe("schemas de crédito", () => {
  it("upload sem crédito, vazio ou só espaços vira null", () => {
    expect(photoUploadBodySchema.parse({})).toEqual({ credit: null });
    expect(photoUploadBodySchema.parse({ credit: "" })).toEqual({ credit: null });
    expect(photoUploadBodySchema.parse({ credit: "   " })).toEqual({ credit: null });
  });

  it("apara espaços e limita a 120 caracteres", () => {
    expect(photoUploadBodySchema.parse({ credit: "  Maria Souza " })).toEqual({ credit: "Maria Souza" });
    expect(() => photoUploadBodySchema.parse({ credit: "x".repeat(121) })).toThrow();
  });

  it("PATCH aceita null para limpar e rejeita chaves desconhecidas", () => {
    expect(updatePhotoSchema.parse({ credit: null })).toEqual({ credit: null });
    expect(() => updatePhotoSchema.parse({ credit: "a", url: "/x" })).toThrow();
    expect(() => updatePhotoSchema.parse({})).toThrow();
  });
});

describe("photoManager.remove", () => {
  it("ao apagar a capa, promove a foto de menor posição restante", async () => {
    const { repo, storage, manager } = setup();
    const photos = [photo("p1", 1), photo("p2", 2), photo("p3", 3)];

    await manager.remove(owner({ coverPhotoId: "p2", photos }), "p2");

    expect(repo.setCover).toHaveBeenCalledWith("o1", "p1");
    expect(repo.deletePhoto).toHaveBeenCalledWith("p2");
    expect(storage.remove).toHaveBeenCalledWith("/uploads/things/o1/p2.jpg");
  });

  it("ao apagar a última foto, a capa fica null", async () => {
    const { repo, manager } = setup();
    await manager.remove(owner({ coverPhotoId: "p1", photos: [photo("p1", 1)] }), "p1");
    expect(repo.setCover).toHaveBeenCalledWith("o1", null);
  });

  it("não mexe na capa ao apagar outra foto", async () => {
    const { repo, manager } = setup();
    await manager.remove(owner({ coverPhotoId: "p1", photos: [photo("p1", 1), photo("p2", 2)] }), "p2");
    expect(repo.setCover).not.toHaveBeenCalled();
    expect(repo.deletePhoto).toHaveBeenCalledWith("p2");
  });

  it("lança 404 se a foto não pertence ao dono", async () => {
    const { repo, manager } = setup();
    await expect(manager.remove(owner({ photos: [photo("p1", 1)] }), "p9")).rejects.toThrow(NotFoundError);
    expect(repo.deletePhoto).not.toHaveBeenCalled();
  });
});

describe("photoManager.setCover", () => {
  it("define a capa quando a foto pertence ao dono", async () => {
    const { repo, manager } = setup();
    await manager.setCover(owner({ photos: [photo("p1", 1), photo("p2", 2)] }), "p2");
    expect(repo.setCover).toHaveBeenCalledWith("o1", "p2");
  });

  it("lança 404 com foto de outro dono", async () => {
    const { repo, manager } = setup();
    await expect(manager.setCover(owner({ photos: [photo("p1", 1)] }), "p-outra")).rejects.toThrow(NotFoundError);
    expect(repo.setCover).not.toHaveBeenCalled();
  });
});

describe("photoManager.removeAll", () => {
  it("apaga a pasta do dono", async () => {
    const { storage, manager } = setup();
    await manager.removeAll("o1");
    expect(storage.removeDir).toHaveBeenCalledWith("things/o1");
  });
});
