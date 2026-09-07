import type { EstablishmentPhoto, Prisma, PrismaClient } from "../../generated/prisma/client";
import type { EstablishmentType } from "./establishments.schemas";

const withPhotos = {
  photos: { orderBy: { position: "asc" } },
  coverPhoto: true,
} satisfies Prisma.EstablishmentInclude;

export type EstablishmentRecord = Prisma.EstablishmentGetPayload<{ include: typeof withPhotos }>;
export type EstablishmentPhotoRecord = EstablishmentPhoto;

export type EstablishmentWriteData = Omit<
  Prisma.EstablishmentUncheckedCreateInput,
  "id" | "coverPhotoId" | "createdAt" | "updatedAt"
>;

export class EstablishmentsRepository {
  constructor(private readonly db: PrismaClient) {}

  findMany(type?: EstablishmentType): Promise<EstablishmentRecord[]> {
    return this.db.establishment.findMany({
      where: type ? { type } : undefined,
      orderBy: { name: "asc" },
      include: withPhotos,
    });
  }

  findById(id: string): Promise<EstablishmentRecord | null> {
    return this.db.establishment.findUnique({ where: { id }, include: withPhotos });
  }

  create(data: EstablishmentWriteData): Promise<EstablishmentRecord> {
    return this.db.establishment.create({ data, include: withPhotos });
  }

  update(id: string, data: Omit<EstablishmentWriteData, "type">): Promise<EstablishmentRecord> {
    return this.db.establishment.update({ where: { id }, data, include: withPhotos });
  }

  async delete(id: string): Promise<void> {
    await this.db.establishment.delete({ where: { id } });
  }

  async addPhoto(establishmentId: string, url: string): Promise<EstablishmentPhotoRecord> {
    const last = await this.db.establishmentPhoto.findFirst({
      where: { establishmentId },
      orderBy: { position: "desc" },
    });
    return this.db.establishmentPhoto.create({
      data: { establishmentId, url, position: (last?.position ?? 0) + 1 },
    });
  }

  async deletePhoto(photoId: string): Promise<void> {
    await this.db.establishmentPhoto.delete({ where: { id: photoId } });
  }

  setCover(establishmentId: string, photoId: string | null): Promise<EstablishmentRecord> {
    return this.db.establishment.update({
      where: { id: establishmentId },
      data: { coverPhotoId: photoId },
      include: withPhotos,
    });
  }
}
