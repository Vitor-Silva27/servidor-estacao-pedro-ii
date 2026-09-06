import type { Cache } from "../../shared/cache/cache";
import { NotFoundError, ValidationError } from "../../shared/errors/AppError";
import type { PhotoInput } from "../../shared/photos/photos";
import type { Storage } from "../../shared/storage/storage";
import type { AttractionsRepository } from "../attractions/attractions.repository";
import type { GuideRecord, GuidesRepository, GuideWriteData } from "./guides.repository";
import type { GuideInput } from "./guides.schemas";
import { toGuideSummary, type GuideSummary } from "./guides.types";

export type GuideOutput = GuideSummary & { attractionIds: string[] };

export const guidePhotosDir = (id: string) => `guides/${id}`;

const LIST_KEY = "guides:list";
const detailKey = (id: string) => `guides:${id}`;
const attractionKey = (id: string) => `attractions:${id}`;

function toOutput(row: GuideRecord): GuideOutput {
  return { ...toGuideSummary(row), attractionIds: row.attractions.map((a) => a.id) };
}

function toWriteData(input: GuideInput): GuideWriteData {
  return {
    name: input.name,
    description: input.description ?? null,
    whatsapp: input.whatsapp,
    instagram: input.instagram ?? null,
  };
}

const linkedIds = (row: GuideRecord) => row.attractions.map((a) => a.id);

export class GuidesService {
  constructor(
    private readonly repo: GuidesRepository,
    private readonly attractions: AttractionsRepository,
    private readonly cache: Cache,
    private readonly storage: Storage,
  ) {}

  async list(): Promise<GuideOutput[]> {
    const cached = await this.cache.get<GuideOutput[]>(LIST_KEY);
    if (cached) return cached;

    const result = (await this.repo.findMany()).map(toOutput);
    await this.cache.set(LIST_KEY, result);
    return result;
  }

  async getById(id: string): Promise<GuideOutput> {
    const cached = await this.cache.get<GuideOutput>(detailKey(id));
    if (cached) return cached;

    const result = toOutput(await this.require(id));
    await this.cache.set(detailKey(id), result);
    return result;
  }

  async create(input: GuideInput): Promise<GuideOutput> {
    await this.assertAttractionsExist(input.attractionIds);
    const row = await this.repo.create(toWriteData(input), input.attractionIds);
    await this.invalidate(row.id, input.attractionIds);
    return toOutput(row);
  }

  async update(id: string, input: GuideInput): Promise<GuideOutput> {
    const existing = await this.require(id);
    await this.assertAttractionsExist(input.attractionIds);
    const row = await this.repo.update(id, toWriteData(input), input.attractionIds);
    await this.invalidate(id, [...linkedIds(existing), ...input.attractionIds]);
    return toOutput(row);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.require(id);
    await this.repo.delete(id);
    await this.storage.removeDir(guidePhotosDir(id));
    await this.invalidate(id, linkedIds(existing));
  }

  async setPhoto(id: string, photo: PhotoInput): Promise<GuideOutput> {
    const existing = await this.require(id);
    const url = await this.storage.save(guidePhotosDir(id), photo.ext, photo.buffer);
    if (existing.photoUrl) {
      await this.storage.remove(existing.photoUrl);
    }
    const row = await this.repo.setPhotoUrl(id, url);
    await this.invalidate(id, linkedIds(existing));
    return toOutput(row);
  }

  private async require(id: string): Promise<GuideRecord> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError("Guia não encontrado");
    return row;
  }

  private async assertAttractionsExist(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const found = await this.attractions.existingIds(ids);
    const missing = ids.filter((id) => !found.includes(id));
    if (missing.length > 0) {
      throw new ValidationError(
        missing.map((id) => ({ path: "attractionIds", message: `Atração inexistente: ${id}` })),
      );
    }
  }

  private async invalidate(id: string, attractionIds: string[]): Promise<void> {
    const keys = [LIST_KEY, detailKey(id), ...[...new Set(attractionIds)].map(attractionKey)];
    await Promise.all(keys.map((key) => this.cache.del(key)));
  }
}
