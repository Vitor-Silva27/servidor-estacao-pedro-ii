import { readFile } from "node:fs/promises";
import path from "node:path";
import { UPLOADS_DIR } from "../../src/config/paths";
import { prisma } from "../../src/lib/prisma";
import { redis } from "../../src/lib/redis";
import { AttractionsRepository } from "../../src/modules/attractions/attractions.repository";
import { GuidesRepository } from "../../src/modules/guides/guides.repository";
import { GuidesService } from "../../src/modules/guides/guides.service";
import { createCache } from "../../src/shared/cache/cache";
import { createLocalStorage } from "../../src/shared/storage/localStorage";

const IMAGES_DIR = path.join(__dirname, "images");

const GUIDE = {
  name: "João Lucas",
  description: "Guia local de trilhas e cachoeiras",
  whatsapp: "5586999990000", // fictício; corrija pelo app
  photo: "joaoLucas.png",
};

export async function seedGuides(): Promise<void> {
  const existing = await prisma.guide.findFirst({ where: { name: GUIDE.name } });
  if (existing) {
    console.log(`Guia "${GUIDE.name}" já existe, pulando.`);
    return;
  }

  const attractionsRepository = new AttractionsRepository(prisma);
  const service = new GuidesService(
    new GuidesRepository(prisma),
    attractionsRepository,
    createCache(redis),
    createLocalStorage(UPLOADS_DIR),
  );

  const attractionIds = (await attractionsRepository.findMany()).map((a) => a.id);
  const created = await service.create({
    name: GUIDE.name,
    description: GUIDE.description,
    whatsapp: GUIDE.whatsapp,
    attractionIds,
  });
  const buffer = await readFile(path.join(IMAGES_DIR, GUIDE.photo));
  await service.setPhoto(created.id, { buffer, ext: "png" });
  console.log(`Guia "${GUIDE.name}" criado, ligado a ${attractionIds.length} atração(ões).`);
}
