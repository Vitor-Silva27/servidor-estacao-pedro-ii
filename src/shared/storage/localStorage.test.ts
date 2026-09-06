import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalStorage } from "./localStorage";

describe("localStorage", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "estacao-storage-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("save grava o arquivo e devolve URL relativa sob /uploads", async () => {
    const storage = createLocalStorage(root);
    const url = await storage.save("attractions/a1", "png", Buffer.from("abc"));

    expect(url).toMatch(/^\/uploads\/attractions\/a1\/[0-9a-f-]{36}\.png$/);
    const file = path.join(root, url.replace("/uploads/", ""));
    await expect(readFile(file, "utf8")).resolves.toBe("abc");
  });

  it("remove apaga o arquivo da URL e ignora URL inexistente", async () => {
    const storage = createLocalStorage(root);
    const url = await storage.save("attractions/a1", "jpg", Buffer.from("x"));
    await storage.remove(url);
    await expect(stat(path.join(root, url.replace("/uploads/", "")))).rejects.toThrow();
    await expect(storage.remove("/uploads/attractions/a1/nao-existe.jpg")).resolves.toBeUndefined();
  });

  it("removeDir apaga o diretório com tudo dentro e ignora inexistente", async () => {
    const storage = createLocalStorage(root);
    await storage.save("attractions/a2", "webp", Buffer.from("x"));
    await storage.removeDir("attractions/a2");
    await expect(stat(path.join(root, "attractions/a2"))).rejects.toThrow();
    await expect(storage.removeDir("attractions/nada")).resolves.toBeUndefined();
  });
});
