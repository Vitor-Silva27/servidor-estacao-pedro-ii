import { createCache, type CacheStore } from "./cache";

function mockStore() {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  } as unknown as jest.Mocked<CacheStore>;
}

describe("cache", () => {
  it("set serializa em JSON com prefixo e TTL padrão", async () => {
    const store = mockStore();
    const cache = createCache(store);
    await cache.set("waterfalls:all", [{ id: 1 }]);
    expect(store.set).toHaveBeenCalledWith("cache:waterfalls:all", '[{"id":1}]', "EX", 60);
  });

  it("set aceita TTL customizado", async () => {
    const store = mockStore();
    const cache = createCache(store, 60);
    await cache.set("k", "v", 5);
    expect(store.set).toHaveBeenCalledWith("cache:k", '"v"', "EX", 5);
  });

  it("get desserializa o valor", async () => {
    const store = mockStore();
    store.get.mockResolvedValue('{"a":1}');
    const cache = createCache(store);
    await expect(cache.get<{ a: number }>("k")).resolves.toEqual({ a: 1 });
    expect(store.get).toHaveBeenCalledWith("cache:k");
  });

  it("get devolve null quando não há valor", async () => {
    const store = mockStore();
    store.get.mockResolvedValue(null);
    const cache = createCache(store);
    await expect(cache.get("k")).resolves.toBeNull();
  });

  it("del remove a chave com prefixo", async () => {
    const store = mockStore();
    const cache = createCache(store);
    await cache.del("k");
    expect(store.del).toHaveBeenCalledWith("cache:k");
  });
});
