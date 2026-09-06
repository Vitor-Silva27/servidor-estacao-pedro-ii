import type { Cache } from "../../shared/cache/cache";
import { NotFoundError } from "../../shared/errors/AppError";
import type { PhotoInput, PhotoManager, PhotoRow } from "../../shared/photos/photos";
import { toGuideSummary, type GuideSummary } from "../guides/guides.types";
import type { AttractionRecord, AttractionsRepository } from "./attractions.repository";
import {
  fieldsSchemaFor,
  type AttractionFields,
  type AttractionType,
  type CreateAttractionInput,
  type TrailLevel,
} from "./attractions.schemas";

export type AttractionSummary = {
  id: string;
  type: AttractionType;
  name: string;
  coverUrl: string | null;
  trailDistance: string | null;
  trailTime: string | null;
  trailLevel: TrailLevel | null;
};

export type PhotoOutput = PhotoRow;

export type AttractionDetail = AttractionSummary & {
  description: string;
  latitude: number;
  longitude: number;
  tips: string | null;
  howToGet: string | null;
  openingHours: string | null;
  price: string | null;
  photos: PhotoOutput[];
  guides: GuideSummary[];
  createdAt: string;
  updatedAt: string;
};

export type { PhotoInput };

export const attractionPhotosDir = (id: string) => `attractions/${id}`;

const listKey = (type?: AttractionType) => `attractions:list:${type ?? "all"}`;
const detailKey = (id: string) => `attractions:${id}`;

function toPhoto(photo: PhotoRow): PhotoOutput {
  return { id: photo.id, url: photo.url, position: photo.position };
}

function toSummary(row: AttractionRecord): AttractionSummary {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    coverUrl: row.coverPhoto?.url ?? null,
    trailDistance: row.trailDistance,
    trailTime: row.trailTime,
    trailLevel: row.trailLevel,
  };
}

function toDetail(row: AttractionRecord): AttractionDetail {
  return {
    ...toSummary(row),
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    tips: row.tips,
    howToGet: row.howToGet,
    openingHours: row.openingHours,
    price: row.price,
    photos: row.photos.map(toPhoto),
    guides: row.guides.map(toGuideSummary),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Campos opcionais ausentes viram null, para que um PUT sem o campo o limpe no banco. */
function normalizeOptional(fields: AttractionFields) {
  const place = "openingHours" in fields ? fields : null;
  return {
    ...fields,
    tips: fields.tips ?? null,
    howToGet: fields.howToGet ?? null,
    openingHours: place?.openingHours ?? null,
    price: place?.price ?? null,
  };
}

export class AttractionsService {
  constructor(
    private readonly repo: AttractionsRepository,
    private readonly cache: Cache,
    private readonly photos: PhotoManager,
  ) {}

  async list(type?: AttractionType): Promise<AttractionSummary[]> {
    const cached = await this.cache.get<AttractionSummary[]>(listKey(type));
    if (cached) return cached;

    const result = (await this.repo.findMany(type)).map(toSummary);
    await this.cache.set(listKey(type), result);
    return result;
  }

  async getById(id: string): Promise<AttractionDetail> {
    const cached = await this.cache.get<AttractionDetail>(detailKey(id));
    if (cached) return cached;

    const result = toDetail(await this.require(id));
    await this.cache.set(detailKey(id), result);
    return result;
  }

  async create(input: CreateAttractionInput): Promise<AttractionDetail> {
    const { type, ...fields } = input;
    const row = await this.repo.create({ ...normalizeOptional(fields), type });
    await this.invalidate(row.id, row.type);
    return toDetail(row);
  }

  async update(id: string, input: unknown): Promise<AttractionDetail> {
    const existing = await this.require(id);
    const fields = fieldsSchemaFor(existing.type).parse(input);
    const row = await this.repo.update(id, normalizeOptional(fields));
    await this.invalidate(id, existing.type);
    return toDetail(row);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.require(id);
    await this.repo.delete(id);
    await this.photos.removeAll(id);
    await this.invalidate(id, existing.type);
  }

  async addPhoto(id: string, photo: PhotoInput): Promise<PhotoOutput> {
    const existing = await this.require(id);
    const created = await this.photos.add(existing, photo);
    await this.invalidate(id, existing.type);
    return created;
  }

  async removePhoto(id: string, photoId: string): Promise<void> {
    const existing = await this.require(id);
    await this.photos.remove(existing, photoId);
    await this.invalidate(id, existing.type);
  }

  async setCover(id: string, photoId: string): Promise<AttractionDetail> {
    const existing = await this.require(id);
    await this.photos.setCover(existing, photoId);
    await this.invalidate(id, existing.type);
    return toDetail(await this.require(id));
  }

  private async require(id: string): Promise<AttractionRecord> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError("Atração não encontrada");
    return row;
  }

  private async invalidate(id: string, type: AttractionType): Promise<void> {
    await Promise.all([
      this.cache.del(listKey()),
      this.cache.del(listKey(type)),
      this.cache.del(detailKey(id)),
    ]);
  }
}
