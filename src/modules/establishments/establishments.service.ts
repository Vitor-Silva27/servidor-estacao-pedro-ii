import type { Cache } from "../../shared/cache/cache";
import { NotFoundError } from "../../shared/errors/AppError";
import type { PhotoInput, PhotoManager, PhotoRow } from "../../shared/photos/photos";
import type { EstablishmentRecord, EstablishmentsRepository } from "./establishments.repository";
import type {
  CreateEstablishmentInput,
  EstablishmentFields,
  EstablishmentType,
  PriceRange,
} from "./establishments.schemas";

export type EstablishmentSummary = {
  id: string;
  type: EstablishmentType;
  name: string;
  coverUrl: string | null;
  priceRange: PriceRange;
  address: string;
};

export type EstablishmentDetail = EstablishmentSummary & {
  description: string;
  latitude: number;
  longitude: number;
  whatsapp: string;
  instagram: string | null;
  openingHours: string | null;
  highlights: string | null;
  photos: PhotoRow[];
  createdAt: string;
  updatedAt: string;
};

export const establishmentPhotosDir = (id: string) => `establishments/${id}`;

const listKey = (type?: EstablishmentType) => `establishments:list:${type ?? "all"}`;
const detailKey = (id: string) => `establishments:${id}`;

function toPhoto(photo: PhotoRow): PhotoRow {
  return { id: photo.id, url: photo.url, position: photo.position };
}

function toSummary(row: EstablishmentRecord): EstablishmentSummary {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    coverUrl: row.coverPhoto?.url ?? null,
    priceRange: row.priceRange,
    address: row.address,
  };
}

function toDetail(row: EstablishmentRecord): EstablishmentDetail {
  return {
    ...toSummary(row),
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    whatsapp: row.whatsapp,
    instagram: row.instagram,
    openingHours: row.openingHours,
    highlights: row.highlights,
    photos: row.photos.map(toPhoto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Opcionais ausentes viram null, para que um PUT sem o campo o limpe no banco. */
function normalizeOptional(fields: EstablishmentFields) {
  return {
    ...fields,
    instagram: fields.instagram ?? null,
    openingHours: fields.openingHours ?? null,
    highlights: fields.highlights ?? null,
  };
}

export class EstablishmentsService {
  constructor(
    private readonly repo: EstablishmentsRepository,
    private readonly cache: Cache,
    private readonly photos: PhotoManager,
  ) {}

  async list(type?: EstablishmentType): Promise<EstablishmentSummary[]> {
    const cached = await this.cache.get<EstablishmentSummary[]>(listKey(type));
    if (cached) return cached;

    const result = (await this.repo.findMany(type)).map(toSummary);
    await this.cache.set(listKey(type), result);
    return result;
  }

  async getById(id: string): Promise<EstablishmentDetail> {
    const cached = await this.cache.get<EstablishmentDetail>(detailKey(id));
    if (cached) return cached;

    const result = toDetail(await this.require(id));
    await this.cache.set(detailKey(id), result);
    return result;
  }

  async create(input: CreateEstablishmentInput): Promise<EstablishmentDetail> {
    const { type, ...fields } = input;
    const row = await this.repo.create({ ...normalizeOptional(fields), type });
    await this.invalidate(row.id, row.type);
    return toDetail(row);
  }

  async update(id: string, input: EstablishmentFields): Promise<EstablishmentDetail> {
    const existing = await this.require(id);
    const row = await this.repo.update(id, normalizeOptional(input));
    await this.invalidate(id, existing.type);
    return toDetail(row);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.require(id);
    await this.repo.delete(id);
    await this.photos.removeAll(id);
    await this.invalidate(id, existing.type);
  }

  async addPhoto(id: string, photo: PhotoInput): Promise<PhotoRow> {
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

  async setCover(id: string, photoId: string): Promise<EstablishmentDetail> {
    const existing = await this.require(id);
    await this.photos.setCover(existing, photoId);
    await this.invalidate(id, existing.type);
    return toDetail(await this.require(id));
  }

  private async require(id: string): Promise<EstablishmentRecord> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError("Estabelecimento não encontrado");
    return row;
  }

  private async invalidate(id: string, type: EstablishmentType): Promise<void> {
    await Promise.all([
      this.cache.del(listKey()),
      this.cache.del(listKey(type)),
      this.cache.del(detailKey(id)),
    ]);
  }
}
