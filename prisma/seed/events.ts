import { readFile } from "node:fs/promises";
import path from "node:path";
import { UPLOADS_DIR } from "../../src/config/paths";
import { prisma } from "../../src/lib/prisma";
import { redis } from "../../src/lib/redis";
import { EventsRepository } from "../../src/modules/events/events.repository";
import type { EventInput } from "../../src/modules/events/events.schemas";
import { EventsService, eventPhotosDir } from "../../src/modules/events/events.service";
import { createCache } from "../../src/shared/cache/cache";
import { createPhotoManager } from "../../src/shared/photos/photos";
import { createLocalStorage } from "../../src/shared/storage/localStorage";

const IMAGES_DIR = path.join(__dirname, "images");

type SeedEvent = EventInput & { photos: string[] };

const events: SeedEvent[] = [
  {
    name: "Festival de Inverno de Pedro II",
    description:
      "O Festival de Inverno reúne shows, apresentações de dança e teatro, feira de artesanato e gastronomia regional nas ruas e praças de Pedro II. Acontece no período mais frio do ano, quando a serra fica com clima ameno e a cidade recebe visitantes de todo o Piauí.",
    startsAt: new Date("2027-07-01T03:00:00.000Z"),
    endsAt: new Date("2027-08-01T02:59:59.000Z"),
    dateNote: "Acontece todo ano entre junho e julho",
    latitude: -4.4247,
    longitude: -41.4586,
    address: "Centro, Pedro II",
    tips: "Leve agasalho: as noites na serra ficam frias. A programação completa é divulgada pela prefeitura perto da data.",
    photos: ["festivalInverno.jpg"],
  },
];

export async function seedEvents(): Promise<void> {
  const repo = new EventsRepository(prisma);
  const service = new EventsService(
    repo,
    createCache(redis),
    createPhotoManager(repo, createLocalStorage(UPLOADS_DIR), eventPhotosDir),
  );

  for (const { photos, ...input } of events) {
    const existing = await prisma.event.findFirst({ where: { name: input.name } });
    if (existing) {
      console.log(`Evento "${input.name}" já existe, pulando.`);
      continue;
    }

    const created = await service.create(input);
    for (const fileName of photos) {
      const buffer = await readFile(path.join(IMAGES_DIR, fileName));
      await service.addPhoto(created.id, { buffer, ext: "jpg" });
    }
    console.log(`Evento "${input.name}" criado com ${photos.length} foto(s).`);
  }
}
