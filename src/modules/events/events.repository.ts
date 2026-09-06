import type { EventPhoto, Prisma, PrismaClient } from "../../generated/prisma/client";
import type { EventScope } from "./events.schemas";

const withPhotos = {
  photos: { orderBy: { position: "asc" } },
  coverPhoto: true,
} satisfies Prisma.EventInclude;

export type EventRecord = Prisma.EventGetPayload<{ include: typeof withPhotos }>;
export type EventPhotoRecord = EventPhoto;

export type EventWriteData = Omit<
  Prisma.EventUncheckedCreateInput,
  "id" | "coverPhotoId" | "createdAt" | "updatedAt"
>;

export class EventsRepository {
  constructor(private readonly db: PrismaClient) {}

  findMany(scope: EventScope, now: Date): Promise<EventRecord[]> {
    return this.db.event.findMany({
      where: scope === "upcoming" ? { endsAt: { gte: now } } : undefined,
      orderBy: { startsAt: "asc" },
      include: withPhotos,
    });
  }

  findById(id: string): Promise<EventRecord | null> {
    return this.db.event.findUnique({ where: { id }, include: withPhotos });
  }

  create(data: EventWriteData): Promise<EventRecord> {
    return this.db.event.create({ data, include: withPhotos });
  }

  update(id: string, data: EventWriteData): Promise<EventRecord> {
    return this.db.event.update({ where: { id }, data, include: withPhotos });
  }

  async delete(id: string): Promise<void> {
    await this.db.event.delete({ where: { id } });
  }

  async addPhoto(eventId: string, url: string): Promise<EventPhotoRecord> {
    const last = await this.db.eventPhoto.findFirst({
      where: { eventId },
      orderBy: { position: "desc" },
    });
    return this.db.eventPhoto.create({
      data: { eventId, url, position: (last?.position ?? 0) + 1 },
    });
  }

  async deletePhoto(photoId: string): Promise<void> {
    await this.db.eventPhoto.delete({ where: { id: photoId } });
  }

  setCover(eventId: string, photoId: string | null): Promise<EventRecord> {
    return this.db.event.update({
      where: { id: eventId },
      data: { coverPhotoId: photoId },
      include: withPhotos,
    });
  }
}
