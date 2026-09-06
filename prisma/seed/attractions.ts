import { readFile } from "node:fs/promises";
import path from "node:path";
import { UPLOADS_DIR } from "../../src/config/paths";
import { prisma } from "../../src/lib/prisma";
import { redis } from "../../src/lib/redis";
import { AttractionsRepository } from "../../src/modules/attractions/attractions.repository";
import type { CreateAttractionInput } from "../../src/modules/attractions/attractions.schemas";
import { AttractionsService, attractionPhotosDir } from "../../src/modules/attractions/attractions.service";
import { createCache } from "../../src/shared/cache/cache";
import { createPhotoManager } from "../../src/shared/photos/photos";
import { createLocalStorage } from "../../src/shared/storage/localStorage";

const IMAGES_DIR = path.join(__dirname, "images");

const WATERFALL_TIPS =
  "Leve água, lanches e evite deixar lixo no local para preservar o meio ambiente. O acesso por estrada de chão pode ser difícil para carros populares, principalmente em épocas de chuva, e é importante usar calçados adequados para a trilha e a descida até a cachoeira.";

const WATERFALL_HOW_TO_GET =
  "Combine com um guia local antes da visita: eles indicam o melhor horário e as condições da trilha no dia.";

type SeedAttraction = CreateAttractionInput & { photos: string[] };

const attractions: SeedAttraction[] = [
  {
    type: "CACHOEIRA",
    name: "Cachoeira do Salto Liso",
    description:
      "A Cachoeira do Salto Liso em Pedro II é um belo ponto de ecoturismo que possui uma queda d'água de cerca de 26 a 35 metros, uma piscina natural de águas claras e um trajeto desafiador com trilhas de terra e pedras escorregadias.",
    latitude: -4.3897,
    longitude: -41.4215,
    tips: WATERFALL_TIPS,
    howToGet: WATERFALL_HOW_TO_GET,
    trailDistance: "2km",
    trailTime: "30min",
    trailLevel: "MEDIA",
    photos: ["saltoLiso.jpg"],
  },
  {
    type: "CACHOEIRA",
    name: "Cachoeira do Urubu Rei",
    description:
      "A Cachoeira do Urubu Rei em Pedro II é a maior queda d'água do estado do Piauí, destacando-se por seus imponentes 76 metros de altura, por ser perene (não secar nunca) e por exigir uma trilha de nível médio em meio à mata.",
    latitude: -4.3742,
    longitude: -41.4638,
    tips: WATERFALL_TIPS,
    howToGet: WATERFALL_HOW_TO_GET,
    trailDistance: "2,3km",
    trailTime: "45min",
    trailLevel: "DIFICIL",
    photos: ["urubuRei.jpg"],
  },
  {
    type: "CACHOEIRA",
    name: "Cachoeira da Samambaia",
    description:
      "A Cachoeira da Samambaia é um atrativo natural em Pedro II que faz parte do Circuito das Cachoeiras, junto com a Cachoeira do Buriti e a Cachoeira do Lajeiro.",
    latitude: -4.4051,
    longitude: -41.4902,
    tips: WATERFALL_TIPS,
    howToGet: WATERFALL_HOW_TO_GET,
    trailDistance: "2km",
    trailTime: "20min",
    trailLevel: "MEDIA",
    photos: ["samambaia.jpg"],
  },
  {
    type: "PONTO_TURISTICO",
    name: "Mirante do Gritador",
    description:
      "O Morro do Gritador, em Pedro II (PI), é um mirante famoso por suas vistas panorâmicas das serras e cânions. O local combina natureza, clima agradável e uma das paisagens mais bonitas da região.",
    latitude: -4.331104320883757,
    longitude: -41.447875520857295,
    tips: "No fim da tarde para aproveitar o pôr do sol. Aproveite para experimentar a culinária local. Leve câmera ou celular para boas fotos da paisagem.",
    howToGet:
      "Para aproveitar melhor a visita e garantir que você chegue sem problemas, entre em contato com os guias locais. Eles podem dar todas as informações sobre a localização.",
    photos: ["morroDoGritador.jpg", "morroDoGritador2.jpg", "morroDoGritador3.jpg"],
  },
  {
    type: "PONTO_TURISTICO",
    name: "Memorial Tertuliano Brandão Filho",
    description:
      "Espaço cultural no centro de Pedro II dedicado à memória de Tertuliano Brandão Filho e à história da cidade, com acervo de fotografias, documentos e objetos que contam a formação do município.",
    latitude: -4.4265230057590395,
    longitude: -41.459379908790176,
    tips: "A visita leva cerca de 10 minutos. Aproveite para conhecer o centro histórico e as lojas de opala no entorno.",
    howToGet: "Fica no centro de Pedro II, com acesso a pé a partir da praça principal.",
    openingHours: "08:00 às 17:00",
    price: "Entrada gratuita",
    photos: ["memorial.jpg"],
  },
];

function extensionOf(fileName: string): string {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}

export async function seedAttractions(): Promise<void> {
  const repo = new AttractionsRepository(prisma);
  const service = new AttractionsService(
    repo,
    createCache(redis),
    createPhotoManager(repo, createLocalStorage(UPLOADS_DIR), attractionPhotosDir),
  );

  for (const { photos, ...input } of attractions) {
    const existing = await prisma.attraction.findFirst({ where: { name: input.name } });
    if (existing) {
      console.log(`Atração "${input.name}" já existe, pulando.`);
      continue;
    }

    const created = await service.create(input);
    for (const fileName of photos) {
      const buffer = await readFile(path.join(IMAGES_DIR, fileName));
      await service.addPhoto(created.id, { buffer, ext: extensionOf(fileName) });
    }
    console.log(`Atração "${input.name}" criada com ${photos.length} foto(s).`);
  }
}
