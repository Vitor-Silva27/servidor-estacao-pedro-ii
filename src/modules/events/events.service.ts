import type { Cache } from "../../shared/cache/cache";
import { NotFoundError } from "../../shared/errors/AppError";
import type { PhotoInput, PhotoManager, PhotoRow } from "../../shared/photos/photos";
import type { EventRecord, EventsRepository } from "./events.repository";
import type { EventInput, EventScope } from "./events.schemas";

export type EventSummary = {
  id: string;
  name: string;
  coverUrl: string | null;
  startsAt: string;
  endsAt: string;
  dateNote: string | null;
  address: string | null;
};

export type EventDetail = EventSummary & {
  description: string;
  latitude: number;
  longitude: number;
  tips: string | null;
  photos: PhotoRow[];
  createdAt: string;
  updatedAt: string;
};

export const eventPhotosDir = (id: string) => `events/${id}`;

const listKey = (scope: EventScope) => `events:list:${scope}`;
const detailKey = (id: string) => `events:${id}`;

function toPhoto(photo: PhotoRow): PhotoRow {
  return { id: photo.id, url: photo.url, position: photo.position };
}

function toSummary(row: EventRecord): EventSummary {
  return {
    id: row.id,
    name: row.name,
    coverUrl: row.coverPhoto?.url ?? null,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    dateNote: row.dateNote,
    address: row.address,
  };
}

function toDetail(row: EventRecord): EventDetail {
  return {
    ...toSummary(row),
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    tips: row.tips,
    photos: row.photos.map(toPhoto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Opcionais ausentes viram null, para que um PUT sem o campo o limpe no banco. */
function normalizeOptional(input: EventInput) {
  return {
    ...input,
    dateNote: input.dateNote ?? null,
    address: input.address ?? null,
    tips: input.tips ?? null,
  };
}

export class EventsService {
  constructor(
    private readonly repo: EventsRepository,
    private readonly cache: Cache,
    private readonly photos: PhotoManager,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(scope: EventScope = "upcoming"): Promise<EventSummary[]> {
    const cached = await this.cache.get<EventSummary[]>(listKey(scope));
    if (cached) return cached;

    const result = (await this.repo.findMany(scope, this.now())).map(toSummary);
    await this.cache.set(listKey(scope), result);
    return result;
  }

  async getById(id: string): Promise<EventDetail> {
    const cached = await this.cache.get<EventDetail>(detailKey(id));
    if (cached) return cached;

    const result = toDetail(await this.require(id));
    await this.cache.set(detailKey(id), result);
    return result;
  }

  async create(input: EventInput): Promise<EventDetail> {
    const row = await this.repo.create(normalizeOptional(input));
    await this.invalidate(row.id);
    return toDetail(row);
  }

  async update(id: string, input: EventInput): Promise<EventDetail> {
    await this.require(id);
    const row = await this.repo.update(id, normalizeOptional(input));
    await this.invalidate(id);
    return toDetail(row);
  }

  async remove(id: string): Promise<void> {
    await this.require(id);
    await this.repo.delete(id);
    await this.photos.removeAll(id);
    await this.invalidate(id);
  }

  async addPhoto(id: string, photo: PhotoInput): Promise<PhotoRow> {
    const existing = await this.require(id);
    const created = await this.photos.add(existing, photo);
    await this.invalidate(id);
    return created;
  }

  async removePhoto(id: string, photoId: string): Promise<void> {
    const existing = await this.require(id);
    await this.photos.remove(existing, photoId);
    await this.invalidate(id);
  }

  async setCover(id: string, photoId: string): Promise<EventDetail> {
    const existing = await this.require(id);
    await this.photos.setCover(existing, photoId);
    await this.invalidate(id);
    return toDetail(await this.require(id));
  }

  private async require(id: string): Promise<EventRecord> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundError("Evento não encontrado");
    return row;
  }

  private async invalidate(id: string): Promise<void> {
    await Promise.all([
      this.cache.del(listKey("upcoming")),
      this.cache.del(listKey("all")),
      this.cache.del(detailKey(id)),
    ]);
  }
}
