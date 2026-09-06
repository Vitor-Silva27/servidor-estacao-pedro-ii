import type { AttractionPhoto, Prisma, PrismaClient } from "../../generated/prisma/client";
import type { AttractionType } from "./attractions.schemas";

const withPhotos = {
  photos: { orderBy: { position: "asc" } },
  coverPhoto: true,
  guides: { orderBy: { name: "asc" } },
} satisfies Prisma.AttractionInclude;

export type AttractionRecord = Prisma.AttractionGetPayload<{ include: typeof withPhotos }>;
export type PhotoRecord = AttractionPhoto;

export type AttractionWriteData = Omit<
  Prisma.AttractionUncheckedCreateInput,
  "id" | "coverPhotoId" | "createdAt" | "updatedAt"
>;

export class AttractionsRepository {
  constructor(private readonly db: PrismaClient) {}

  findMany(type?: AttractionType): Promise<AttractionRecord[]> {
    return this.db.attraction.findMany({
      where: type ? { type } : undefined,
      orderBy: { name: "asc" },
      include: withPhotos,
    });
  }

  findById(id: string): Promise<AttractionRecord | null> {
    return this.db.attraction.findUnique({ where: { id }, include: withPhotos });
  }

  /** Devolve, dentre os ids informados, os que existem. */
  async existingIds(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.attraction.findMany({ where: { id: { in: ids } }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  create(data: AttractionWriteData): Promise<AttractionRecord> {
    return this.db.attraction.create({ data, include: withPhotos });
  }

  update(id: string, data: Omit<AttractionWriteData, "type">): Promise<AttractionRecord> {
    return this.db.attraction.update({ where: { id }, data, include: withPhotos });
  }

  async delete(id: string): Promise<void> {
    await this.db.attraction.delete({ where: { id } });
  }

  async addPhoto(attractionId: string, url: string): Promise<PhotoRecord> {
    const last = await this.db.attractionPhoto.findFirst({
      where: { attractionId },
      orderBy: { position: "desc" },
    });
    return this.db.attractionPhoto.create({
      data: { attractionId, url, position: (last?.position ?? 0) + 1 },
    });
  }

  async deletePhoto(photoId: string): Promise<void> {
    await this.db.attractionPhoto.delete({ where: { id: photoId } });
  }

  setCover(attractionId: string, photoId: string | null): Promise<AttractionRecord> {
    return this.db.attraction.update({
      where: { id: attractionId },
      data: { coverPhotoId: photoId },
      include: withPhotos,
    });
  }
}
