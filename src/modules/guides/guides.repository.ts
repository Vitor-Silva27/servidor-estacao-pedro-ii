import type { Prisma, PrismaClient } from "../../generated/prisma/client";

const withAttractions = {
  attractions: { select: { id: true } },
} satisfies Prisma.GuideInclude;

export type GuideRecord = Prisma.GuideGetPayload<{ include: typeof withAttractions }>;

export type GuideWriteData = {
  name: string;
  description: string | null;
  whatsapp: string;
  instagram: string | null;
};

const connectIds = (ids: string[]) => ids.map((id) => ({ id }));

export class GuidesRepository {
  constructor(private readonly db: PrismaClient) {}

  findMany(): Promise<GuideRecord[]> {
    return this.db.guide.findMany({ orderBy: { name: "asc" }, include: withAttractions });
  }

  findById(id: string): Promise<GuideRecord | null> {
    return this.db.guide.findUnique({ where: { id }, include: withAttractions });
  }

  create(data: GuideWriteData, attractionIds: string[]): Promise<GuideRecord> {
    return this.db.guide.create({
      data: { ...data, attractions: { connect: connectIds(attractionIds) } },
      include: withAttractions,
    });
  }

  update(id: string, data: GuideWriteData, attractionIds: string[]): Promise<GuideRecord> {
    return this.db.guide.update({
      where: { id },
      data: { ...data, attractions: { set: connectIds(attractionIds) } },
      include: withAttractions,
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.guide.delete({ where: { id } });
  }

  setPhotoUrl(id: string, photoUrl: string): Promise<GuideRecord> {
    return this.db.guide.update({ where: { id }, data: { photoUrl }, include: withAttractions });
  }
}
