# Módulo de estabelecimentos — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar hospedagens e restaurantes no servidor como um módulo único `establishments` com tipo, contato, faixa de preço e fotos, compartilhar a normalização de contatos com guias, e fazer o app listar, detalhar e administrar estabelecimentos.

**Architecture:** Módulo `src/modules/establishments` espelhando atrações e eventos, reusando photo manager, storage, cache e upload. Normalização de WhatsApp e Instagram extraída de guias para `src/shared/contacts.ts`. No app, helpers de link de contato extraídos para `src/services/contacts.ts`, `Card` ganha preço e endereço, e a tela de fotos genérica ganha o terceiro `kind`.

**Tech Stack:** Servidor: Express 5, Prisma 7, zod 4, multer, ioredis, Jest + supertest. App: Expo SDK 54, React Navigation 7, expo-image-picker, `Linking`.

**Spec:** `docs/superpowers/specs/2026-09-06-estabelecimentos-design.md`

---

## Convenções para quem executa

- Servidor: `C:\Users\vitpe\projetos\servidor-estacao-pedro-ii`, branch `main`. App: `C:\Users\vitpe\projetos\Estacao-Pedro-II`, branch `joao/changes`.
- Todo commit termina com as duas linhas abaixo (o executor adiciona com `-m` extras):
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019wXNXudFqQ9FRtrNjFk5oU
  ```
- Crie arquivos com a ferramenta Write e edite os existentes com Edit depois de ler. Nunca use heredoc de shell.
- Antes de rodar Prisma: `docker compose up -d --wait postgres redis`. Postgres de dev em `localhost:5434`.
- Testes: `npm test`, `npm run test:e2e`, `npm run typecheck`.

## Mapa de arquivos

### Servidor

| Arquivo | Responsabilidade |
|---|---|
| `src/shared/contacts.ts` (+ test) | Normalização e schemas zod de WhatsApp e Instagram |
| `src/modules/guides/guides.schemas.ts` (+ test) | Passa a importar de `shared/contacts` |
| `prisma/schema.prisma` | `Establishment`, `EstablishmentPhoto`, enums |
| `src/modules/establishments/establishments.schemas.ts` | zod: fields, create, params, query, cover |
| `src/modules/establishments/establishments.repository.ts` | Prisma |
| `src/modules/establishments/establishments.service.ts` (+ test) | Cache, fotos, normalização de opcionais |
| `src/modules/establishments/establishments.controller.ts`, `establishments.routes.ts` | HTTP |
| `src/app.ts` | Router |
| `docs/openapi.yaml` | Tag Establishments |
| `tests/e2e/setup.ts`, `tests/e2e/establishments.e2e.test.ts` | E2E |
| `README.md` | Seção Estabelecimentos |

### App

| Arquivo | Responsabilidade |
|---|---|
| `src/services/contacts.ts` | `whatsappUrl`, `instagramUrl` |
| `src/services/guidesApi.ts`, `src/shared/Components/GuideCards/index.tsx` | Passam a usar `contacts.ts` |
| `src/services/establishmentsApi.ts` | Tipos, chamadas, labels |
| `src/shared/Components/Card` | Props `price` e `address` |
| `src/pages/Home/index.tsx` | Hospedagem e Restaurantes da API |
| `src/pages/EstablishmentDetails/index.tsx` | Detalhe |
| `src/pages/admin/AdminEstablishments`, `AdminEstablishmentForm` | Admin |
| `src/pages/admin/AdminPhotos/index.tsx`, `AdminMenu/index.tsx`, `src/AppRoutes.tsx` | Terceiro `kind`, item, rotas |

---

## Task 1: Contatos compartilhados e refactor de guias

**Files:**
- Create: `src/shared/contacts.ts`, `src/shared/contacts.test.ts`
- Modify: `src/modules/guides/guides.schemas.ts`, `src/modules/guides/guides.service.test.ts`

- [ ] **Step 1: Escrever src/shared/contacts.test.ts**

```ts
import { z } from "zod";
import { instagramSchema, normalizeInstagram, normalizeWhatsapp, whatsappSchema } from "./contacts";

const schema = z.object({ whatsapp: whatsappSchema, instagram: instagramSchema.optional() });

describe("contacts", () => {
  it("normalizeWhatsapp mantém só dígitos", () => {
    expect(normalizeWhatsapp("+55 (86) 99999-0000")).toBe("5586999990000");
  });

  it("normalizeInstagram remove @ e espaços", () => {
    expect(normalizeInstagram("@Joao.Lucas ")).toBe("Joao.Lucas");
  });

  it("whatsappSchema aceita máscara e devolve dígitos com DDI", () => {
    expect(schema.parse({ whatsapp: "+55 (86) 99999-0000" }).whatsapp).toBe("5586999990000");
    expect(schema.parse({ whatsapp: "55 86 9999 0000" }).whatsapp).toBe("558699990000");
  });

  it("whatsappSchema rejeita número sem DDI no campo whatsapp", () => {
    const result = schema.safeParse({ whatsapp: "(86) 99999-0000" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["whatsapp"]);
  });

  it("instagramSchema normaliza e valida", () => {
    expect(schema.parse({ whatsapp: "5586999990000", instagram: "@Joao.Lucas " }).instagram).toBe("Joao.Lucas");
    expect(schema.safeParse({ whatsapp: "5586999990000", instagram: "joao lucas!" }).success).toBe(false);
    expect(schema.safeParse({ whatsapp: "5586999990000", instagram: "@ " }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npm test -- contacts
```

Expected: FAIL, "Cannot find module './contacts'".

- [ ] **Step 3: Criar src/shared/contacts.ts**

```ts
import { z } from "zod";

const WHATSAPP_MESSAGE = "Informe DDI, DDD e número, ex.: 55 86 99999-0000";
const INSTAGRAM_MESSAGE = "Use só letras, números, ponto e sublinhado";

/** Mantém só dígitos: "+55 (86) 99999-0000" → "5586999990000". */
export const normalizeWhatsapp = (value: string) => value.replace(/\D/g, "");

/** Remove @ e espaços: "@Joao.Lucas " → "Joao.Lucas". */
export const normalizeInstagram = (value: string) => value.replace(/[@\s]/g, "");

/** WhatsApp com DDI: 12 ou 13 dígitos depois de normalizar. */
export const whatsappSchema = z
  .string()
  .transform(normalizeWhatsapp)
  .refine((digits) => digits.length === 12 || digits.length === 13, { message: WHATSAPP_MESSAGE });

/** Handle do Instagram sem @: letras, números, ponto e sublinhado, 1 a 30 caracteres. */
export const instagramSchema = z
  .string()
  .transform(normalizeInstagram)
  .pipe(z.string().regex(/^[A-Za-z0-9._]{1,30}$/, { message: INSTAGRAM_MESSAGE }));
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
npm test -- contacts
```

Expected: PASS, 5 testes.

- [ ] **Step 5: Reescrever src/modules/guides/guides.schemas.ts**

```ts
import { z } from "zod";
import { instagramSchema, whatsappSchema } from "../../shared/contacts";

export const guideSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).optional(),
  whatsapp: whatsappSchema,
  instagram: instagramSchema.optional(),
  attractionIds: z
    .array(z.uuid())
    .refine((ids) => new Set(ids).size === ids.length, { message: "Atrações repetidas" }),
});

export const guideIdParamsSchema = z.object({ id: z.uuid() });

export type GuideInput = z.infer<typeof guideSchema>;
```

- [ ] **Step 6: Reduzir o describe do schema em src/modules/guides/guides.service.test.ts**

Troque o bloco inteiro `describe("guideSchema", () => { ... });` por este, que mantém só a regra própria de guias:

```ts
describe("guideSchema", () => {
  it("rejeita attractionIds repetidos e não-uuid", () => {
    const base = { name: "João", whatsapp: "5586999990000" };
    const id = "11111111-1111-4111-8111-111111111111";
    expect(guideSchema.safeParse({ ...base, attractionIds: [id, id] }).success).toBe(false);
    expect(guideSchema.safeParse({ ...base, attractionIds: ["x"] }).success).toBe(false);
  });
});
```

- [ ] **Step 7: Rodar tudo, incluindo e2e de guias, e commit**

```powershell
npm run typecheck
npm test
npm run test:e2e
git add src/shared/contacts.ts src/shared/contacts.test.ts src/modules/guides
git commit -m "refactor: normalização de contatos compartilhada entre módulos"
```

Expected: typecheck limpo; unitários 12 suítes, 93 testes (92 - 5 do schema de guias + 1 mantido + 5 de contatos); e2e 5 suítes, 38 testes sem mudança.

---

## Task 2: Schema, schemas zod, repository e service

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/modules/establishments/establishments.schemas.ts`, `establishments.repository.ts`, `establishments.service.ts`, `establishments.service.test.ts`

- [ ] **Step 1: Adicionar ao final de prisma/schema.prisma**

```prisma
enum EstablishmentType {
  HOSPEDAGEM
  RESTAURANTE
}

enum PriceRange {
  BAIXO
  MEDIO
  ALTO
}

model Establishment {
  id           String               @id @default(uuid())
  type         EstablishmentType
  name         String
  description  String
  latitude     Float
  longitude    Float
  address      String
  whatsapp     String
  instagram    String?
  openingHours String?
  priceRange   PriceRange
  highlights   String?
  coverPhotoId String?              @unique
  coverPhoto   EstablishmentPhoto?  @relation("EstablishmentCover", fields: [coverPhotoId], references: [id], onDelete: SetNull)
  photos       EstablishmentPhoto[] @relation("EstablishmentGallery")
  createdAt    DateTime             @default(now())
  updatedAt    DateTime             @updatedAt
}

model EstablishmentPhoto {
  id              String         @id @default(uuid())
  establishmentId String
  establishment   Establishment  @relation("EstablishmentGallery", fields: [establishmentId], references: [id], onDelete: Cascade)
  coverOf         Establishment? @relation("EstablishmentCover")
  url             String
  position        Int
  createdAt       DateTime       @default(now())
}
```

- [ ] **Step 2: Migration e client**

```powershell
docker compose up -d --wait postgres redis
npx prisma migrate dev --name add_establishments
npx prisma generate
```

- [ ] **Step 3: Criar src/modules/establishments/establishments.schemas.ts**

```ts
import { z } from "zod";
import { instagramSchema, whatsappSchema } from "../../shared/contacts";

export const ESTABLISHMENT_TYPES = ["HOSPEDAGEM", "RESTAURANTE"] as const;
export const PRICE_RANGES = ["BAIXO", "MEDIO", "ALTO"] as const;

export type EstablishmentType = (typeof ESTABLISHMENT_TYPES)[number];
export type PriceRange = (typeof PRICE_RANGES)[number];

const optionalText = z.string().trim().min(1).optional();

export const establishmentFieldsSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().trim().min(3),
  whatsapp: whatsappSchema,
  instagram: instagramSchema.optional(),
  openingHours: optionalText,
  priceRange: z.enum(PRICE_RANGES),
  highlights: optionalText,
});

export const createEstablishmentSchema = establishmentFieldsSchema.extend({
  type: z.enum(ESTABLISHMENT_TYPES),
});

export const establishmentIdParamsSchema = z.object({ id: z.uuid() });
export const establishmentPhotoParamsSchema = z.object({ id: z.uuid(), photoId: z.uuid() });
export const establishmentListQuerySchema = z.object({ type: z.enum(ESTABLISHMENT_TYPES).optional() });
export const establishmentCoverSchema = z.object({ photoId: z.uuid() });

export type EstablishmentFields = z.infer<typeof establishmentFieldsSchema>;
export type CreateEstablishmentInput = z.infer<typeof createEstablishmentSchema>;
```

- [ ] **Step 4: Criar src/modules/establishments/establishments.repository.ts**

```ts
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
```

- [ ] **Step 5: Escrever src/modules/establishments/establishments.service.test.ts**

```ts
import { NotFoundError } from "../../shared/errors/AppError";
import type { Cache } from "../../shared/cache/cache";
import type { PhotoManager } from "../../shared/photos/photos";
import type { EstablishmentPhotoRecord, EstablishmentRecord, EstablishmentsRepository } from "./establishments.repository";
import { createEstablishmentSchema, establishmentFieldsSchema } from "./establishments.schemas";
import { EstablishmentsService } from "./establishments.service";

function photo(id: string, position: number, establishmentId = "s1"): EstablishmentPhotoRecord {
  return { id, establishmentId, url: `/uploads/establishments/${establishmentId}/${id}.jpg`, position, createdAt: new Date() };
}

function record(overrides: Partial<EstablishmentRecord> = {}): EstablishmentRecord {
  return {
    id: "s1",
    type: "RESTAURANTE",
    name: "Sabor da Serra",
    description: "Cozinha regional com vista para a serra.",
    latitude: -4.42,
    longitude: -41.46,
    address: "Rua Principal, 100",
    whatsapp: "5586999990000",
    instagram: null,
    openingHours: null,
    priceRange: "MEDIO",
    highlights: null,
    coverPhotoId: null,
    coverPhoto: null,
    photos: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function setup() {
  const repo = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    addPhoto: jest.fn(),
    deletePhoto: jest.fn(),
    setCover: jest.fn(),
  } as unknown as jest.Mocked<EstablishmentsRepository>;
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() } as unknown as jest.Mocked<Cache>;
  const photos = {
    add: jest.fn(),
    remove: jest.fn(),
    setCover: jest.fn(),
    removeAll: jest.fn(),
  } as unknown as jest.Mocked<PhotoManager>;
  const service = new EstablishmentsService(repo, cache, photos);
  return { repo, cache, photos, service };
}

const fields = {
  name: "Sabor da Serra",
  description: "Cozinha regional com vista para a serra.",
  latitude: -4.42,
  longitude: -41.46,
  address: "Rua Principal, 100",
  whatsapp: "5586999990000",
  priceRange: "MEDIO" as const,
};

describe("schemas de estabelecimento", () => {
  it("create exige type e normaliza contatos", () => {
    const parsed = createEstablishmentSchema.parse({ ...fields, type: "HOSPEDAGEM", whatsapp: "+55 (86) 99999-0000", instagram: "@pousada " });
    expect(parsed.type).toBe("HOSPEDAGEM");
    expect(parsed.whatsapp).toBe("5586999990000");
    expect(parsed.instagram).toBe("pousada");
  });

  it("fields rejeita type e chaves desconhecidas", () => {
    expect(establishmentFieldsSchema.safeParse({ ...fields, type: "RESTAURANTE" }).success).toBe(false);
    expect(establishmentFieldsSchema.safeParse({ ...fields, menu: "x" }).success).toBe(false);
  });

  it("rejeita priceRange fora do enum e endereço curto", () => {
    expect(establishmentFieldsSchema.safeParse({ ...fields, priceRange: "$$" }).success).toBe(false);
    expect(establishmentFieldsSchema.safeParse({ ...fields, address: "ab" }).success).toBe(false);
  });
});

describe("EstablishmentsService.list", () => {
  it("devolve do cache quando existe", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue([{ id: "x" }]);
    await expect(service.list("HOSPEDAGEM")).resolves.toEqual([{ id: "x" }]);
    expect(cache.get).toHaveBeenCalledWith("establishments:list:HOSPEDAGEM");
    expect(repo.findMany).not.toHaveBeenCalled();
  });

  it("busca, resume e grava no cache", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue(null);
    const cover = photo("p1", 1);
    repo.findMany.mockResolvedValue([record({ coverPhotoId: "p1", coverPhoto: cover, photos: [cover] })]);

    const result = await service.list();

    expect(repo.findMany).toHaveBeenCalledWith(undefined);
    expect(result).toEqual([
      {
        id: "s1",
        type: "RESTAURANTE",
        name: "Sabor da Serra",
        coverUrl: "/uploads/establishments/s1/p1.jpg",
        priceRange: "MEDIO",
        address: "Rua Principal, 100",
      },
    ]);
    expect(cache.set).toHaveBeenCalledWith("establishments:list:all", result);
  });
});

describe("EstablishmentsService.getById", () => {
  it("devolve detalhe com fotos e datas ISO, sem campos internos", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue(null);
    const p1 = photo("p1", 1);
    repo.findById.mockResolvedValue(record({ coverPhotoId: "p1", coverPhoto: p1, photos: [p1], highlights: "Música ao vivo" }));

    const result = await service.getById("s1");

    expect(result.photos).toEqual([{ id: "p1", url: "/uploads/establishments/s1/p1.jpg", position: 1 }]);
    expect(result.highlights).toBe("Música ao vivo");
    expect(result.whatsapp).toBe("5586999990000");
    expect(result.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result).not.toHaveProperty("coverPhoto");
    expect(cache.set).toHaveBeenCalledWith("establishments:s1", result);
  });

  it("lança 404 quando não existe", async () => {
    const { repo, cache, service } = setup();
    cache.get.mockResolvedValue(null);
    repo.findById.mockResolvedValue(null);
    await expect(service.getById("x")).rejects.toThrow(NotFoundError);
  });
});

describe("EstablishmentsService.create e update", () => {
  it("create normaliza opcionais para null e invalida as três chaves", async () => {
    const { repo, cache, service } = setup();
    repo.create.mockResolvedValue(record());

    await service.create({ ...fields, type: "RESTAURANTE" });

    expect(repo.create).toHaveBeenCalledWith({
      ...fields,
      type: "RESTAURANTE",
      instagram: null,
      openingHours: null,
      highlights: null,
    });
    expect(cache.del).toHaveBeenCalledWith("establishments:list:all");
    expect(cache.del).toHaveBeenCalledWith("establishments:list:RESTAURANTE");
    expect(cache.del).toHaveBeenCalledWith("establishments:s1");
  });

  it("update mantém o tipo gravado e invalida", async () => {
    const { repo, cache, service } = setup();
    repo.findById.mockResolvedValue(record());
    repo.update.mockResolvedValue(record({ name: "Novo" }));

    const result = await service.update("s1", { ...fields, name: "Novo", openingHours: "11h às 22h" });

    expect(repo.update).toHaveBeenCalledWith("s1", {
      ...fields,
      name: "Novo",
      instagram: null,
      openingHours: "11h às 22h",
      highlights: null,
    });
    expect(result.name).toBe("Novo");
    expect(cache.del).toHaveBeenCalledWith("establishments:list:RESTAURANTE");
  });

  it("update de inexistente dá 404", async () => {
    const { repo, service } = setup();
    repo.findById.mockResolvedValue(null);
    await expect(service.update("x", fields)).rejects.toThrow(NotFoundError);
  });
});

describe("EstablishmentsService.remove e fotos", () => {
  it("remove apaga registro, pasta e invalida", async () => {
    const { repo, cache, photos, service } = setup();
    repo.findById.mockResolvedValue(record());

    await service.remove("s1");

    expect(repo.delete).toHaveBeenCalledWith("s1");
    expect(photos.removeAll).toHaveBeenCalledWith("s1");
    expect(cache.del).toHaveBeenCalledWith("establishments:list:all");
  });

  it("addPhoto, removePhoto e setCover delegam ao manager e invalidam", async () => {
    const { repo, cache, photos, service } = setup();
    const existing = record({ photos: [photo("p1", 1)] });
    repo.findById.mockResolvedValue(existing);
    photos.add.mockResolvedValue({ id: "p2", url: "/uploads/establishments/s1/p2.jpg", position: 2 });

    await expect(service.addPhoto("s1", { buffer: Buffer.from("x"), ext: "jpg" })).resolves.toEqual({
      id: "p2",
      url: "/uploads/establishments/s1/p2.jpg",
      position: 2,
    });
    expect(photos.add).toHaveBeenCalledWith(existing, { buffer: Buffer.from("x"), ext: "jpg" });

    await service.removePhoto("s1", "p1");
    expect(photos.remove).toHaveBeenCalledWith(existing, "p1");

    await service.setCover("s1", "p1");
    expect(photos.setCover).toHaveBeenCalledWith(existing, "p1");

    expect(cache.del).toHaveBeenCalledWith("establishments:s1");
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

```powershell
npm test -- establishments.service
```

Expected: FAIL, "Cannot find module './establishments.service'".

- [ ] **Step 7: Criar src/modules/establishments/establishments.service.ts**

```ts
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
```

- [ ] **Step 8: Rodar e ver passar, typecheck e commit**

```powershell
npm test -- establishments.service
npm run typecheck
git add prisma/schema.prisma prisma/migrations src/modules/establishments
git commit -m "feat: schema, schemas zod, repository e service de estabelecimentos"
```

Expected: PASS, 12 testes; typecheck limpo.

---

## Task 3: Rotas, OpenAPI, e2e e README

**Files:**
- Create: `src/modules/establishments/establishments.controller.ts`, `establishments.routes.ts`, `tests/e2e/establishments.e2e.test.ts`
- Modify: `src/app.ts`, `docs/openapi.yaml`, `tests/e2e/setup.ts`, `README.md`

- [ ] **Step 1: Criar src/modules/establishments/establishments.controller.ts**

```ts
import type { RequestHandler } from "express";
import { ValidationError } from "../../shared/errors/AppError";
import { extensionFor } from "../../shared/middlewares/upload";
import { establishmentListQuerySchema } from "./establishments.schemas";
import type { EstablishmentsService } from "./establishments.service";

export function createEstablishmentsController(service: EstablishmentsService) {
  const list: RequestHandler = async (req, res) => {
    const { type } = establishmentListQuerySchema.parse(req.query);
    res.json(await service.list(type));
  };

  const getById: RequestHandler = async (req, res) => {
    res.json(await service.getById(req.params.id as string));
  };

  const create: RequestHandler = async (req, res) => {
    res.status(201).json(await service.create(req.body));
  };

  const update: RequestHandler = async (req, res) => {
    res.json(await service.update(req.params.id as string, req.body));
  };

  const remove: RequestHandler = async (req, res) => {
    await service.remove(req.params.id as string);
    res.status(204).send();
  };

  const addPhoto: RequestHandler = async (req, res) => {
    const file = req.file;
    if (!file) throw new ValidationError([{ path: "file", message: "Arquivo obrigatório" }]);
    const ext = extensionFor(file.mimetype);
    if (!ext) throw new ValidationError([{ path: "file", message: "Formato inválido. Use JPEG, PNG ou WebP" }]);
    res.status(201).json(await service.addPhoto(req.params.id as string, { buffer: file.buffer, ext }));
  };

  const removePhoto: RequestHandler = async (req, res) => {
    await service.removePhoto(req.params.id as string, req.params.photoId as string);
    res.status(204).send();
  };

  const setCover: RequestHandler = async (req, res) => {
    res.json(await service.setCover(req.params.id as string, req.body.photoId));
  };

  return { list, getById, create, update, remove, addPhoto, removePhoto, setCover };
}
```

- [ ] **Step 2: Criar src/modules/establishments/establishments.routes.ts**

```ts
import { Router } from "express";
import type { TokenService } from "../auth/token.service";
import { authenticate } from "../../shared/middlewares/authenticate";
import { authorize } from "../../shared/middlewares/authorize";
import { uploadImage } from "../../shared/middlewares/upload";
import { validate } from "../../shared/middlewares/validate";
import { createEstablishmentsController } from "./establishments.controller";
import {
  createEstablishmentSchema,
  establishmentCoverSchema,
  establishmentFieldsSchema,
  establishmentIdParamsSchema,
  establishmentPhotoParamsSchema,
} from "./establishments.schemas";
import type { EstablishmentsService } from "./establishments.service";

export function createEstablishmentsRouter(service: EstablishmentsService, tokens: TokenService) {
  const router = Router();
  const controller = createEstablishmentsController(service);
  const admin = [authenticate(tokens), authorize("ADMIN")];
  const byId = validate({ params: establishmentIdParamsSchema });

  router.get("/", controller.list);
  router.get("/:id", byId, controller.getById);

  router.post("/", ...admin, validate({ body: createEstablishmentSchema }), controller.create);
  router.put("/:id", ...admin, byId, validate({ body: establishmentFieldsSchema }), controller.update);
  router.delete("/:id", ...admin, byId, controller.remove);

  router.post("/:id/photos", ...admin, byId, uploadImage, controller.addPhoto);
  router.delete("/:id/photos/:photoId", ...admin, validate({ params: establishmentPhotoParamsSchema }), controller.removePhoto);
  router.put("/:id/cover", ...admin, byId, validate({ body: establishmentCoverSchema }), controller.setCover);

  return router;
}
```

- [ ] **Step 3: Montar em src/app.ts**

Adicione aos imports:

```ts
import { createEstablishmentsRouter } from "./modules/establishments/establishments.routes";
import { EstablishmentsRepository } from "./modules/establishments/establishments.repository";
import { EstablishmentsService, establishmentPhotosDir } from "./modules/establishments/establishments.service";
```

Depois do bloco que constrói `guidesService`:

```ts
  const establishmentsRepository = new EstablishmentsRepository(prisma);
  const establishmentsService = new EstablishmentsService(
    establishmentsRepository,
    cache,
    createPhotoManager(establishmentsRepository, storage, establishmentPhotosDir),
  );
```

Depois de `app.use("/api/v1/guides", ...)`:

```ts
  app.use("/api/v1/establishments", createEstablishmentsRouter(establishmentsService, tokens));
```

- [ ] **Step 4: OpenAPI**

Adicione `- name: Establishments` em `tags`. Em `paths:`, depois do último path de guides:

```yaml
  /api/v1/establishments:
    get:
      tags: [Establishments]
      summary: Lista hospedagens e restaurantes
      parameters:
        - in: query
          name: type
          schema: { $ref: "#/components/schemas/EstablishmentType" }
      responses:
        "200":
          description: Lista ordenada por nome
          content:
            application/json:
              schema:
                type: array
                items: { $ref: "#/components/schemas/EstablishmentSummary" }
    post:
      tags: [Establishments]
      summary: Cria um estabelecimento (admin)
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/EstablishmentInput" }
      responses:
        "201":
          description: Criado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Establishment" }
        "400":
          $ref: "#/components/responses/ValidationError"
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"

  /api/v1/establishments/{id}:
    parameters:
      - $ref: "#/components/parameters/EstablishmentId"
    get:
      tags: [Establishments]
      summary: Detalhe de um estabelecimento
      responses:
        "200":
          description: Estabelecimento com fotos
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Establishment" }
        "404":
          $ref: "#/components/responses/NotFound"
    put:
      tags: [Establishments]
      summary: Atualiza um estabelecimento (admin). O tipo não muda.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/EstablishmentFields" }
      responses:
        "200":
          description: Atualizado
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Establishment" }
        "400":
          $ref: "#/components/responses/ValidationError"
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"
    delete:
      tags: [Establishments]
      summary: Apaga o estabelecimento, suas fotos e arquivos (admin)
      security:
        - bearerAuth: []
      responses:
        "204":
          description: Apagado
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"

  /api/v1/establishments/{id}/photos:
    parameters:
      - $ref: "#/components/parameters/EstablishmentId"
    post:
      tags: [Establishments]
      summary: Envia uma foto (admin). A primeira vira capa.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              required: [file]
              properties:
                file:
                  type: string
                  format: binary
                  description: JPEG, PNG ou WebP até 5 MB
      responses:
        "201":
          description: Foto criada
          content:
            application/json:
              schema: { $ref: "#/components/schemas/AttractionPhoto" }
        "400":
          $ref: "#/components/responses/ValidationError"
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"

  /api/v1/establishments/{id}/photos/{photoId}:
    parameters:
      - $ref: "#/components/parameters/EstablishmentId"
      - in: path
        name: photoId
        required: true
        schema: { type: string, format: uuid }
    delete:
      tags: [Establishments]
      summary: Remove uma foto (admin). Se era a capa, a próxima assume.
      security:
        - bearerAuth: []
      responses:
        "204":
          description: Removida
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"

  /api/v1/establishments/{id}/cover:
    parameters:
      - $ref: "#/components/parameters/EstablishmentId"
    put:
      tags: [Establishments]
      summary: Define a foto de capa (admin)
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [photoId]
              properties:
                photoId: { type: string, format: uuid }
      responses:
        "200":
          description: Capa definida
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Establishment" }
        "400":
          $ref: "#/components/responses/ValidationError"
        "401":
          $ref: "#/components/responses/Unauthorized"
        "403":
          $ref: "#/components/responses/Forbidden"
        "404":
          $ref: "#/components/responses/NotFound"
```

Em `components.parameters`:

```yaml
    EstablishmentId:
      in: path
      name: id
      required: true
      schema: { type: string, format: uuid }
```

Em `components.schemas`:

```yaml
    EstablishmentType:
      type: string
      enum: [HOSPEDAGEM, RESTAURANTE]

    PriceRange:
      type: string
      enum: [BAIXO, MEDIO, ALTO]
      description: Mostrado no app como $, $$ e $$$

    EstablishmentSummary:
      type: object
      properties:
        id: { type: string, format: uuid }
        type: { $ref: "#/components/schemas/EstablishmentType" }
        name: { type: string }
        coverUrl: { type: string, nullable: true }
        priceRange: { $ref: "#/components/schemas/PriceRange" }
        address: { type: string }

    Establishment:
      allOf:
        - $ref: "#/components/schemas/EstablishmentSummary"
        - type: object
          properties:
            description: { type: string }
            latitude: { type: number }
            longitude: { type: number }
            whatsapp: { type: string, example: "5586999990000", description: Só dígitos, com DDI }
            instagram: { type: string, nullable: true, description: Sem @ }
            openingHours: { type: string, nullable: true, example: Seg a Sáb, 11h às 22h }
            highlights: { type: string, nullable: true, example: Cozinha regional, música ao vivo }
            photos:
              type: array
              items: { $ref: "#/components/schemas/AttractionPhoto" }
            createdAt: { type: string, format: date-time }
            updatedAt: { type: string, format: date-time }

    EstablishmentFields:
      type: object
      required: [name, description, latitude, longitude, address, whatsapp, priceRange]
      properties:
        name: { type: string, minLength: 2, maxLength: 120 }
        description: { type: string, minLength: 10 }
        latitude: { type: number, minimum: -90, maximum: 90 }
        longitude: { type: number, minimum: -180, maximum: 180 }
        address: { type: string, minLength: 3 }
        whatsapp: { type: string, example: "+55 (86) 99999-0000", description: Qualquer máscara; guardado só com dígitos }
        instagram: { type: string, example: "@pousada.serra" }
        openingHours: { type: string }
        priceRange: { $ref: "#/components/schemas/PriceRange" }
        highlights: { type: string }

    EstablishmentInput:
      allOf:
        - type: object
          required: [type]
          properties:
            type: { $ref: "#/components/schemas/EstablishmentType" }
        - $ref: "#/components/schemas/EstablishmentFields"
```

- [ ] **Step 5: Atualizar tests/e2e/setup.ts**

Troque a linha do TRUNCATE por:

```ts
    'TRUNCATE TABLE "EstablishmentPhoto", "Establishment", "_AttractionToGuide", "Guide", "EventPhoto", "Event", "AttractionPhoto", "Attraction", "User" CASCADE',
```

- [ ] **Step 6: Criar tests/e2e/establishments.e2e.test.ts**

```ts
import { existsSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { createApp } from "../../src/app";
import { UPLOADS_DIR } from "../../src/config/paths";
import { loginAs } from "./helpers/users";

const app = createApp();
const PIXEL = path.join(__dirname, "fixtures/pixel.png");

const lodging = {
  type: "HOSPEDAGEM",
  name: "Pousada E2E",
  description: "Pousada criada pelos testes de ponta a ponta.",
  latitude: -4.42,
  longitude: -41.46,
  address: "Rua das Flores, 10",
  whatsapp: "+55 (86) 99999-0000",
  priceRange: "MEDIO",
  highlights: "Café da manhã incluso",
};

const restaurant = {
  type: "RESTAURANTE",
  name: "Restaurante E2E",
  description: "Restaurante criado pelos testes de ponta a ponta.",
  latitude: -4.43,
  longitude: -41.46,
  address: "Praça Central, 1",
  whatsapp: "5586988880000",
  priceRange: "BAIXO",
};

describe("estabelecimentos", () => {
  let admin: string;
  let tourist: string;
  let lodgingId: string;

  beforeAll(async () => {
    admin = await loginAs(app, "ADMIN");
    tourist = await loginAs(app, "TOURIST");
  });

  it("GET / é público e começa vazio", async () => {
    const res = await request(app).get("/api/v1/establishments");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("POST / sem token dá 401 e com turista dá 403", async () => {
    expect((await request(app).post("/api/v1/establishments").send(lodging)).status).toBe(401);
    expect((await request(app).post("/api/v1/establishments").set("Authorization", `Bearer ${tourist}`).send(lodging)).status).toBe(403);
  });

  it("admin cria hospedagem e restaurante; WhatsApp mascarado volta normalizado", async () => {
    const auth = { Authorization: `Bearer ${admin}` };
    const l = await request(app).post("/api/v1/establishments").set(auth).send(lodging);
    expect(l.status).toBe(201);
    expect(l.body).toMatchObject({ ...lodging, whatsapp: "5586999990000", instagram: null, openingHours: null, coverUrl: null, photos: [] });
    lodgingId = l.body.id;

    const r = await request(app).post("/api/v1/establishments").set(auth).send(restaurant);
    expect(r.status).toBe(201);
    expect(r.body.highlights).toBeNull();
  });

  it("GET /?type=RESTAURANTE devolve só o restaurante", async () => {
    const res = await request(app).get("/api/v1/establishments?type=RESTAURANTE");
    expect(res.body.map((e: { name: string }) => e.name)).toEqual(["Restaurante E2E"]);
    expect(res.body[0]).toEqual({
      id: expect.any(String),
      type: "RESTAURANTE",
      name: "Restaurante E2E",
      coverUrl: null,
      priceRange: "BAIXO",
      address: "Praça Central, 1",
    });
    expect((await request(app).get("/api/v1/establishments")).body).toHaveLength(2);
  });

  it("PUT com type dá 400; PUT válido normaliza o Instagram", async () => {
    const auth = { Authorization: `Bearer ${admin}` };
    const { type, ...fields } = lodging;
    const bad = await request(app).put(`/api/v1/establishments/${lodgingId}`).set(auth).send({ ...fields, type: "RESTAURANTE" });
    expect(bad.status).toBe(400);

    const ok = await request(app).put(`/api/v1/establishments/${lodgingId}`).set(auth).send({ ...fields, instagram: "@Pousada.E2E" });
    expect(ok.status).toBe(200);
    expect(ok.body.instagram).toBe("Pousada.E2E");
    expect(ok.body.type).toBe("HOSPEDAGEM");
  });

  it("upload vira capa e o arquivo é servido", async () => {
    const res = await request(app)
      .post(`/api/v1/establishments/${lodgingId}/photos`)
      .set("Authorization", `Bearer ${admin}`)
      .attach("file", PIXEL);
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/uploads\/establishments\/.+\.png$/);

    const detail = await request(app).get(`/api/v1/establishments/${lodgingId}`);
    expect(detail.body.coverUrl).toBe(res.body.url);
    expect((await request(app).get(res.body.url)).status).toBe(200);
  });

  it("DELETE apaga o estabelecimento e a pasta", async () => {
    const dir = path.join(UPLOADS_DIR, "establishments", lodgingId);
    expect(existsSync(dir)).toBe(true);
    const del = await request(app).delete(`/api/v1/establishments/${lodgingId}`).set("Authorization", `Bearer ${admin}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/v1/establishments/${lodgingId}`)).status).toBe(404);
    expect(existsSync(dir)).toBe(false);
  });
});
```

- [ ] **Step 7: Verificar**

```powershell
node -e "const Y=require('yaml');const fs=require('fs');const d=Y.parse(fs.readFileSync('docs/openapi.yaml','utf8'));console.log(Object.keys(d.paths).length,'paths')"
npm run typecheck
npm test
npm run test:e2e
```

Expected: `24 paths`; typecheck limpo; unitários 105; e2e 6 suítes, 45 testes.

- [ ] **Step 8: README**

Na árvore, depois de `guides/`:

```
    establishments/   hospedagens e restaurantes, com contato, preço e fotos
```

E dentro de `shared/`, depois de `photos/`:

```
    contacts.ts       normalização de WhatsApp e Instagram, usada por guias e estabelecimentos
```

Seção nova depois de "Guias":

```markdown
## Estabelecimentos

Hospedagens e restaurantes são o mesmo recurso, `Establishment`, com `type` igual a `HOSPEDAGEM` ou `RESTAURANTE` e os mesmos campos: nome, descrição, localização, endereço, WhatsApp, Instagram, horário, faixa de preço (`BAIXO`, `MEDIO`, `ALTO`, mostrada como $, $$ e $$$) e destaques em texto livre. Fotos com capa como nas atrações, em `uploads/establishments/<id>/`.

| Método | Rota | Faz |
|---|---|---|
| GET | `/api/v1/establishments?type=` | Lista resumida, ordenada por nome |
| GET | `/api/v1/establishments/:id` | Detalhe com fotos |
| POST | `/api/v1/establishments` | Cria |
| PUT | `/api/v1/establishments/:id` | Atualiza (o tipo não muda) |
| DELETE | `/api/v1/establishments/:id` | Apaga registro, fotos e arquivos |
| POST | `/api/v1/establishments/:id/photos` | Upload no campo `file` |
| DELETE | `/api/v1/establishments/:id/photos/:photoId` | Remove a foto |
| PUT | `/api/v1/establishments/:id/cover` | Define a capa |

WhatsApp e Instagram seguem as mesmas regras dos guias. Cache de 60 segundos nas leituras, invalidado em toda escrita. Não há seed: o admin cadastra pelo app.
```

No "Roteiro de módulos", troque `5. Hospedagem e restaurantes` por `5. Hospedagem e restaurantes — concluído`.

- [ ] **Step 9: Commit**

```powershell
git add src/modules/establishments src/app.ts docs/openapi.yaml tests README.md
git commit -m "feat: rotas de estabelecimentos, OpenAPI, e2e e README"
```

---
## Task 4: App — contatos compartilhados, serviço, Card, Home e EstablishmentDetails

Diretório: `C:\Users\vitpe\projetos\Estacao-Pedro-II`, branch `joao/changes`.

**Files:**
- Create: `src/services/contacts.ts`, `src/services/establishmentsApi.ts`, `src/pages/EstablishmentDetails/index.tsx`
- Modify: `src/services/guidesApi.ts`, `src/shared/Components/GuideCards/index.tsx`, `src/shared/Components/Card/index.tsx`, `src/pages/Home/index.tsx`, `src/AppRoutes.tsx`

- [ ] **Step 1: Criar src/services/contacts.ts**

```ts
/** Abre conversa no WhatsApp com mensagem pronta citando o assunto (nome da atração ou do estabelecimento). */
export function whatsappUrl(whatsapp: string, subject: string): string {
    const text = `Olá! Vi seu contato no app Estação Pedro II e quero informações sobre ${subject}`;
    return `https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`;
}

export function instagramUrl(handle: string): string {
    return `https://instagram.com/${handle}`;
}
```

- [ ] **Step 2: Tirar os helpers de src/services/guidesApi.ts**

Remova as funções `whatsappUrl` e `instagramUrl` do arquivo (mantendo `formatWhatsapp` e as demais).

Em `src/shared/Components/GuideCards/index.tsx`, troque:

```tsx
import { instagramUrl, whatsappUrl, type GuideSummary } from "@/services/guidesApi";
```

por:

```tsx
import { instagramUrl, whatsappUrl } from "@/services/contacts";
import type { GuideSummary } from "@/services/guidesApi";
```

- [ ] **Step 3: Criar src/services/establishmentsApi.ts**

```ts
import { api } from "./api";
import type { AttractionPhoto } from "./attractionsApi";

export type EstablishmentType = "HOSPEDAGEM" | "RESTAURANTE";
export type PriceRange = "BAIXO" | "MEDIO" | "ALTO";

export const ESTABLISHMENT_TYPE_LABEL: Record<EstablishmentType, string> = {
    HOSPEDAGEM: "Hospedagem",
    RESTAURANTE: "Restaurante",
};

export const PRICE_RANGE_LABEL: Record<PriceRange, string> = {
    BAIXO: "$",
    MEDIO: "$$",
    ALTO: "$$$",
};

export type EstablishmentSummary = {
    id: string;
    type: EstablishmentType;
    name: string;
    coverUrl: string | null;
    priceRange: PriceRange;
    address: string;
};

export type Establishment = EstablishmentSummary & {
    description: string;
    latitude: number;
    longitude: number;
    whatsapp: string;
    instagram: string | null;
    openingHours: string | null;
    highlights: string | null;
    photos: AttractionPhoto[];
    createdAt: string;
    updatedAt: string;
};

export type EstablishmentInput = {
    name: string;
    description: string;
    latitude: number;
    longitude: number;
    address: string;
    whatsapp: string;
    instagram?: string;
    openingHours?: string;
    priceRange: PriceRange;
    highlights?: string;
};

const BASE = "/api/v1/establishments";

export function listEstablishments(type?: EstablishmentType) {
    const query = type ? `?type=${type}` : "";
    return api<EstablishmentSummary[]>(`${BASE}${query}`);
}

export function getEstablishment(id: string) {
    return api<Establishment>(`${BASE}/${id}`);
}

export function createEstablishment(type: EstablishmentType, input: EstablishmentInput) {
    return api<Establishment>(BASE, { method: "POST", body: { type, ...input } });
}

export function updateEstablishment(id: string, input: EstablishmentInput) {
    return api<Establishment>(`${BASE}/${id}`, { method: "PUT", body: input });
}

export function deleteEstablishment(id: string) {
    return api<void>(`${BASE}/${id}`, { method: "DELETE" });
}

export function uploadEstablishmentPhoto(id: string, fileUri: string, mimeType: string, fileName: string) {
    const form = new FormData();
    form.append("file", { uri: fileUri, type: mimeType, name: fileName } as unknown as Blob);
    return api<AttractionPhoto>(`${BASE}/${id}/photos`, { method: "POST", body: form });
}

export function deleteEstablishmentPhoto(id: string, photoId: string) {
    return api<void>(`${BASE}/${id}/photos/${photoId}`, { method: "DELETE" });
}

export function setEstablishmentCover(id: string, photoId: string) {
    return api<Establishment>(`${BASE}/${id}/cover`, { method: "PUT", body: { photoId } });
}
```

- [ ] **Step 4: Card com preço e endereço**

Em `src/shared/Components/Card/index.tsx`, adicione à `Props`, depois de `level?: string;`:

```tsx
    price?: string;
    address?: string;
```

Inclua `price` e `address` na desestruturação dos parâmetros do componente. Dentro de `<View style={styles.info}>`, depois do bloco `{date && (...)}`, adicione:

```tsx
                    {price && (
                        <View style={styles.infoItem}>
                            <Feather name="dollar-sign" size={16} color="#0087F7" />
                            <Text style={styles.infoText}>{price}</Text>
                        </View>
                    )}

                    {address && (
                        <View style={[styles.infoItem, { flexShrink: 1 }]}>
                            <Feather name="map-pin" size={16} color="#0087F7" />
                            <Text style={styles.infoText} numberOfLines={1}>{address}</Text>
                        </View>
                    )}
```

- [ ] **Step 5: Reescrever src/pages/Home/index.tsx**

```tsx
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, Image, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { useNavigation } from "@react-navigation/native"
import { TSScreenDefinitionsProps } from "@/AppRoutes";
import { useAuth } from '@/contexts/AuthContext';
import { useRequest } from '@/hooks/useRequest';
import {
    imageUrl,
    listAttractions,
    TRAIL_LEVEL_LABEL,
    type AttractionType,
} from '@/services/attractionsApi';
import { listEstablishments, PRICE_RANGE_LABEL, type EstablishmentType } from '@/services/establishmentsApi';
import { formatPeriod, listEvents } from '@/services/eventsApi';
import { Theme } from '@/shared/Themes';

import { styles } from './styles';
import { Images } from '@/shared/Assets';
import { Button } from '@/shared/Components/Button';
import { Chip } from '@/shared/Components/Chip';
import { Card } from '@/shared/Components/Card';
import { categories } from "@/data/categories"

const CATEGORY_TYPE: Record<string, AttractionType | undefined> = {
    "Cachoeiras": "CACHOEIRA",
    "Pontos turísticos": "PONTO_TURISTICO",
};

const CATEGORY_ESTABLISHMENT_TYPE: Record<string, EstablishmentType | undefined> = {
    "Hospedagem": "HOSPEDAGEM",
    "Restaurantes": "RESTAURANTE",
};

const EMPTY_TEXT: Record<string, string> = {
    "Cachoeiras": "Nenhuma cachoeira cadastrada ainda.",
    "Pontos turísticos": "Nenhum ponto turístico cadastrado ainda.",
    "Eventos": "Nenhum evento programado.",
    "Hospedagem": "Nenhuma hospedagem cadastrada ainda.",
    "Restaurantes": "Nenhum restaurante cadastrado ainda.",
};

export const Home = () => {

    const navigation = useNavigation<TSScreenDefinitionsProps>();
    const { user, signOut } = useAuth();
    const isAdmin = user?.role === "ADMIN";

    const [selectedCategory, setSelectedCategory] = useState(categories[0]);
    const type = CATEGORY_TYPE[selectedCategory];
    const establishmentType = CATEGORY_ESTABLISHMENT_TYPE[selectedCategory];
    const isEvents = selectedCategory === "Eventos";

    const attractions = useRequest(
        () => (type ? listAttractions(type) : Promise.resolve([])),
        [type],
    );
    const events = useRequest(
        () => (isEvents ? listEvents() : Promise.resolve([])),
        [isEvents],
    );
    const establishments = useRequest(
        () => (establishmentType ? listEstablishments(establishmentType) : Promise.resolve([])),
        [establishmentType],
    );

    const active = type ? attractions : isEvents ? events : establishmentType ? establishments : null;
    const isEmpty = active !== null && !active.loading && !active.error && active.data?.length === 0;

    return (
        <ScrollView>
            <View style={styles.container}>

                <View style={styles.header}>

                    <View style={styles.containerLogo}>
                        <Image source={Images.logoBlue} />
                        <View>
                            <Text style={styles.title}>Bem vindo(a){user ? `, ${user.name}` : ""}</Text>
                            <Text style={styles.subtitle}>Estação Pedro II</Text>
                        </View>
                    </View>

                    {isAdmin && (
                        <TouchableOpacity
                            style={styles.headerButton}
                            onPress={() => navigation.navigate("AdminMenu")}
                            accessibilityLabel="Administração"
                        >
                            <Feather name="settings" size={22} color={Theme.colors.primary500} />
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity style={styles.headerButton} onPress={signOut} accessibilityLabel="Sair">
                        <Feather name="log-out" size={22} color={Theme.colors.primary500} />
                    </TouchableOpacity>

                </View>

                <Text style={styles.description}>
                    Explore cultura, natureza ou eventos.
                </Text>

            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoriesContaine}
            >
                {categories.map(category => (
                    <Chip
                        key={category}
                        title={category}
                        selected={selectedCategory === category}
                        onPress={() => setSelectedCategory(category)}
                    />
                ))}
            </ScrollView>

            <View style={styles.containerCards}>
                {active?.loading && (
                    <ActivityIndicator size="large" color={Theme.colors.primary500} />
                )}

                {active?.error && (
                    <View style={styles.feedback}>
                        <Text style={styles.feedbackText}>{active.error}</Text>
                        <Button title="Tentar de novo" variant="outline" onPress={active.reload} />
                    </View>
                )}

                {isEmpty && (
                    <Text style={styles.feedbackText}>{EMPTY_TEXT[selectedCategory]}</Text>
                )}

                {type && attractions.data?.map(item => (
                    <Card
                        key={item.id}
                        image={item.coverUrl ? { uri: imageUrl(item.coverUrl) } : undefined}
                        title={item.name}
                        distance={item.trailDistance ?? undefined}
                        time={item.trailTime ?? undefined}
                        level={item.trailLevel ? TRAIL_LEVEL_LABEL[item.trailLevel] : undefined}
                        buttonText={type === "CACHOEIRA" ? "Ver detalhes da trilha" : "Ver detalhes do ponto turístico"}
                        onPress={() => navigation.navigate("AttractionDetails", { id: item.id })}
                    />
                ))}

                {isEvents && events.data?.map(item => (
                    <Card
                        key={item.id}
                        image={item.coverUrl ? { uri: imageUrl(item.coverUrl) } : undefined}
                        title={item.name}
                        date={formatPeriod(item.startsAt, item.endsAt)}
                        buttonText="Ver detalhes do evento"
                        onPress={() => navigation.navigate("EventDetails", { id: item.id })}
                    />
                ))}

                {establishmentType && establishments.data?.map(item => (
                    <Card
                        key={item.id}
                        image={item.coverUrl ? { uri: imageUrl(item.coverUrl) } : undefined}
                        title={item.name}
                        price={PRICE_RANGE_LABEL[item.priceRange]}
                        address={item.address}
                        buttonText={establishmentType === "HOSPEDAGEM" ? "Ver detalhes da hospedagem" : "Ver detalhes do restaurante"}
                        onPress={() => navigation.navigate("EstablishmentDetails", { id: item.id })}
                    />
                ))}
            </View>
        </ScrollView>
    );
}
```

- [ ] **Step 6: Criar src/pages/EstablishmentDetails/index.tsx**

```tsx
import { ActivityIndicator, Alert, Image, Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";
import { LinearGradient } from "expo-linear-gradient";

import { TSScreenDefinitionsProps } from "@/AppRoutes";
import { useRequest } from "@/hooks/useRequest";
import { imageUrl } from "@/services/attractionsApi";
import { instagramUrl, whatsappUrl } from "@/services/contacts";
import {
    ESTABLISHMENT_TYPE_LABEL,
    getEstablishment,
    PRICE_RANGE_LABEL,
} from "@/services/establishmentsApi";
import { Button } from "@/shared/Components/Button";
import { Theme } from "@/shared/Themes";
import { detailsStyles as styles } from "../details.styles";

type Section = { title: string; text: string | null };

async function open(url: string) {
    try {
        await Linking.openURL(url);
    } catch {
        Alert.alert("Não foi possível abrir o aplicativo");
    }
}

export const EstablishmentDetails = () => {
    const navigation = useNavigation<TSScreenDefinitionsProps>();
    const { id } = useRoute().params as { id: string };

    const { data: place, loading, error, reload } = useRequest(() => getEstablishment(id), [id]);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={Theme.colors.primary500} />
            </View>
        );
    }

    if (error || !place) {
        return (
            <View style={styles.center}>
                <Text style={styles.feedbackText}>{error ?? "Estabelecimento não encontrado"}</Text>
                <Button title="Tentar de novo" variant="outline" onPress={reload} />
                <Button title="Voltar" variant="link" onPress={() => navigation.goBack()} />
            </View>
        );
    }

    const sections: Section[] = [
        { title: "Sobre", text: place.description },
        { title: "Destaques", text: place.highlights },
        { title: "Horário", text: place.openingHours },
        { title: "Endereço", text: place.address },
    ];

    return (
        <ScrollView>
            <View style={styles.mapContainer}>
                <TouchableOpacity style={styles.buttonBack} onPress={() => navigation.goBack()}>
                    <Feather name="arrow-left" size={24} color="#F3F0FA" />
                </TouchableOpacity>

                <MapView
                    style={styles.map}
                    initialRegion={{
                        latitude: place.latitude,
                        longitude: place.longitude,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                    }}
                >
                    <Marker coordinate={{ latitude: place.latitude, longitude: place.longitude }} title={place.name} />
                </MapView>

                <LinearGradient
                    colors={["transparent", "rgba(255,255,255,0.3)", "rgba(255,255,255,0.7)", "#F3F0FA"]}
                    style={styles.gradient}
                />
            </View>

            <View style={styles.content}>
                <View>
                    <Text style={styles.title}>{place.name}</Text>
                    <Text style={styles.period}>
                        {ESTABLISHMENT_TYPE_LABEL[place.type]} · {PRICE_RANGE_LABEL[place.priceRange]}
                    </Text>
                </View>

                <View style={{ gap: 12 }}>
                    <Button title="Chamar no WhatsApp" onPress={() => open(whatsappUrl(place.whatsapp, place.name))} />
                    {place.instagram && (
                        <Button title="Ver no Instagram" variant="outline" onPress={() => open(instagramUrl(place.instagram as string))} />
                    )}
                </View>

                {place.photos.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photosContainer}>
                        {place.photos.map((photo) => (
                            <Image key={photo.id} source={{ uri: imageUrl(photo.url) }} style={styles.photo} />
                        ))}
                    </ScrollView>
                )}

                {sections
                    .filter((section) => section.text)
                    .map((section) => (
                        <View key={section.title}>
                            <Text style={styles.sectionTitle}>{section.title}</Text>
                            <Text style={styles.sectionText}>{section.text}</Text>
                        </View>
                    ))}
            </View>
        </ScrollView>
    );
};
```

- [ ] **Step 7: Rota em src/AppRoutes.tsx**

Adicione o import `import { EstablishmentDetails } from './pages/EstablishmentDetails';`. Em `TScreenDefinitions`, depois de `EventDetails: { id: string };`, adicione `EstablishmentDetails: { id: string };`. No bloco `hasSession`, depois de `EventDetails`, adicione `<Stack.Screen name="EstablishmentDetails" component={EstablishmentDetails} />`.

- [ ] **Step 8: Typecheck, export e commit**

```powershell
npx tsc --noEmit
npx expo export --platform android --output-dir "C:\Users\vitpe\AppData\Local\Temp\claude\expo-export-check"
Remove-Item -Recurse -Force "C:\Users\vitpe\AppData\Local\Temp\claude\expo-export-check"
git add -A
git commit -m "feat: hospedagens e restaurantes na Home e tela de detalhe"
```

---

## Task 5: App — admin de estabelecimentos

**Files:**
- Create: `src/pages/admin/AdminEstablishments/index.tsx`, `src/pages/admin/AdminEstablishmentForm/index.tsx`
- Modify: `src/pages/admin/AdminPhotos/index.tsx`, `src/pages/admin/AdminMenu/index.tsx`, `src/AppRoutes.tsx`

- [ ] **Step 1: Terceiro kind em src/pages/admin/AdminPhotos/index.tsx**

Adicione o import:

```tsx
import {
    deleteEstablishmentPhoto,
    getEstablishment,
    setEstablishmentCover,
    uploadEstablishmentPhoto,
} from "@/services/establishmentsApi";
```

Troque `export type PhotoOwnerKind = "attraction" | "event";` por:

```tsx
export type PhotoOwnerKind = "attraction" | "event" | "establishment";
```

E adicione ao `SOURCES`, depois da entrada `event`:

```tsx
    establishment: {
        get: getEstablishment,
        upload: uploadEstablishmentPhoto,
        remove: deleteEstablishmentPhoto,
        setCover: setEstablishmentCover,
    },
```

- [ ] **Step 2: Criar src/pages/admin/AdminEstablishments/index.tsx**

```tsx
import { ActivityIndicator, Alert, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useState } from "react";

import { TSScreenDefinitionsProps } from "@/AppRoutes";
import { errorMessage, useRequest } from "@/hooks/useRequest";
import { imageUrl } from "@/services/attractionsApi";
import {
    deleteEstablishment,
    ESTABLISHMENT_TYPE_LABEL,
    listEstablishments,
    PRICE_RANGE_LABEL,
    type EstablishmentSummary,
    type EstablishmentType,
} from "@/services/establishmentsApi";
import { Button } from "@/shared/Components/Button";
import { ChipSelect } from "@/shared/Components/ChipSelect";
import { ScreenHeader } from "@/shared/Components/ScreenHeader";
import { Theme } from "@/shared/Themes";
import { adminStyles as styles } from "../styles";

type Filter = "ALL" | EstablishmentType;

const FILTER_OPTIONS = [
    { value: "ALL" as const, label: "Todos" },
    { value: "HOSPEDAGEM" as const, label: "Hospedagem" },
    { value: "RESTAURANTE" as const, label: "Restaurantes" },
];

export const AdminEstablishments = () => {
    const navigation = useNavigation<TSScreenDefinitionsProps>();
    const [filter, setFilter] = useState<Filter>("ALL");
    const { data, loading, error, reload } = useRequest(
        () => listEstablishments(filter === "ALL" ? undefined : filter),
        [filter],
    );
    const [actionError, setActionError] = useState<string | null>(null);

    useFocusEffect(useCallback(() => { reload(); }, [reload]));

    function confirmDelete(item: EstablishmentSummary) {
        Alert.alert("Apagar estabelecimento", `Apagar "${item.name}" e todas as fotos? Isso não pode ser desfeito.`, [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Apagar",
                style: "destructive",
                onPress: async () => {
                    setActionError(null);
                    try {
                        await deleteEstablishment(item.id);
                        reload();
                    } catch (err) {
                        setActionError(errorMessage(err));
                    }
                },
            },
        ]);
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader title="Estabelecimentos" />
            <ScrollView contentContainerStyle={styles.content}>
                <Button title="Novo estabelecimento" onPress={() => navigation.navigate("AdminEstablishmentForm", {})} />
                <ChipSelect label="Mostrar" options={FILTER_OPTIONS} value={filter} onChange={setFilter} />

                {actionError && <Text style={styles.errorText}>{actionError}</Text>}
                {loading && <ActivityIndicator size="large" color={Theme.colors.primary500} />}
                {error && (
                    <View style={styles.center}>
                        <Text style={styles.feedbackText}>{error}</Text>
                        <Button title="Tentar de novo" variant="outline" onPress={reload} />
                    </View>
                )}

                {data?.map((item) => (
                    <View key={item.id} style={styles.listItem}>
                        <TouchableOpacity
                            style={[styles.row, { flex: 1 }]}
                            onPress={() => navigation.navigate("AdminEstablishmentForm", { id: item.id })}
                        >
                            {item.coverUrl ? (
                                <Image source={{ uri: imageUrl(item.coverUrl) }} style={styles.thumb} />
                            ) : (
                                <View style={styles.thumb}>
                                    <Feather name="home" size={24} color="#A9A9B8" />
                                </View>
                            )}
                            <View style={{ flex: 1 }}>
                                <Text style={styles.listTitle} numberOfLines={1}>{item.name}</Text>
                                <Text style={styles.listSubtitle}>
                                    {ESTABLISHMENT_TYPE_LABEL[item.type]} · {PRICE_RANGE_LABEL[item.priceRange]}
                                </Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.iconButton}
                            onPress={() => navigation.navigate("AdminPhotos", { kind: "establishment", id: item.id })}
                            accessibilityLabel="Fotos"
                        >
                            <Feather name="camera" size={22} color={Theme.colors.primary500} />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.iconButton} onPress={() => confirmDelete(item)} accessibilityLabel="Apagar">
                            <Feather name="trash-2" size={22} color="#C62828" />
                        </TouchableOpacity>
                    </View>
                ))}

                {data?.length === 0 && !loading && (
                    <Text style={styles.feedbackText}>Nenhum estabelecimento cadastrado.</Text>
                )}
            </ScrollView>
        </View>
    );
};
```

- [ ] **Step 3: Criar src/pages/admin/AdminEstablishmentForm/index.tsx**

```tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import { TSScreenDefinitionsProps } from "@/AppRoutes";
import { errorMessage } from "@/hooks/useRequest";
import { ApiError } from "@/services/api";
import {
    createEstablishment,
    getEstablishment,
    updateEstablishment,
    type EstablishmentInput,
    type EstablishmentType,
    type PriceRange,
} from "@/services/establishmentsApi";
import { Button } from "@/shared/Components/Button";
import { ChipSelect } from "@/shared/Components/ChipSelect";
import { Input } from "@/shared/Components/Input";
import { ScreenHeader } from "@/shared/Components/ScreenHeader";
import { Theme } from "@/shared/Themes";
import { adminStyles as styles } from "../styles";

type FormState = {
    name: string;
    description: string;
    address: string;
    latitude: string;
    longitude: string;
    whatsapp: string;
    instagram: string;
    openingHours: string;
    priceRange: PriceRange | null;
    highlights: string;
};

const EMPTY: FormState = {
    name: "",
    description: "",
    address: "",
    latitude: "",
    longitude: "",
    whatsapp: "",
    instagram: "",
    openingHours: "",
    priceRange: null,
    highlights: "",
};

const TYPE_OPTIONS = [
    { value: "HOSPEDAGEM" as const, label: "Hospedagem" },
    { value: "RESTAURANTE" as const, label: "Restaurante" },
];

const PRICE_OPTIONS = [
    { value: "BAIXO" as const, label: "$" },
    { value: "MEDIO" as const, label: "$$" },
    { value: "ALTO" as const, label: "$$$" },
];

function orUndefined(value: string) {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
}

export const AdminEstablishmentForm = () => {
    const navigation = useNavigation<TSScreenDefinitionsProps>();
    const { id } = useRoute().params as { id?: string };
    const isEditing = Boolean(id);

    const [type, setType] = useState<EstablishmentType | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        getEstablishment(id)
            .then((e) => {
                setType(e.type);
                setForm({
                    name: e.name,
                    description: e.description,
                    address: e.address,
                    latitude: String(e.latitude),
                    longitude: String(e.longitude),
                    whatsapp: e.whatsapp,
                    instagram: e.instagram ?? "",
                    openingHours: e.openingHours ?? "",
                    priceRange: e.priceRange,
                    highlights: e.highlights ?? "",
                });
            })
            .catch((err) => setError(errorMessage(err)))
            .finally(() => setLoading(false));
    }, [id]);

    const set = (field: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

    async function handleSave() {
        const errors: Record<string, string> = {};
        if (!type) errors.type = "Escolha o tipo";
        if (!form.priceRange) errors.priceRange = "Escolha a faixa de preço";
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            return;
        }

        const input: EstablishmentInput = {
            name: form.name.trim(),
            description: form.description.trim(),
            address: form.address.trim(),
            latitude: Number(form.latitude.replace(",", ".")),
            longitude: Number(form.longitude.replace(",", ".")),
            whatsapp: form.whatsapp.trim(),
            instagram: orUndefined(form.instagram),
            openingHours: orUndefined(form.openingHours),
            priceRange: form.priceRange as PriceRange,
            highlights: orUndefined(form.highlights),
        };

        setSaving(true);
        setError(null);
        setFieldErrors({});
        try {
            if (id) {
                await updateEstablishment(id, input);
                navigation.goBack();
            } else {
                const created = await createEstablishment(type as EstablishmentType, input);
                navigation.replace("AdminPhotos", { kind: "establishment", id: created.id });
            }
        } catch (err) {
            if (err instanceof ApiError && err.details.length > 0) {
                setFieldErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
            } else {
                setError(errorMessage(err));
            }
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={Theme.colors.primary500} />
            </View>
        );
    }

    return (
        <View style={styles.screen}>
            <ScreenHeader title={isEditing ? "Editar estabelecimento" : "Novo estabelecimento"} />
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <ChipSelect label="Tipo" options={TYPE_OPTIONS} value={type} onChange={setType} disabled={isEditing} error={fieldErrors.type} />
                <Input label="Nome" value={form.name} onChangeText={set("name")} error={fieldErrors.name} />
                <Input label="Descrição" value={form.description} onChangeText={set("description")} multiline error={fieldErrors.description} />
                <Input label="Endereço" value={form.address} onChangeText={set("address")} placeholder="Rua, número, bairro" error={fieldErrors.address} />
                <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                        <Input label="Latitude" value={form.latitude} onChangeText={set("latitude")} keyboardType="numbers-and-punctuation" placeholder="-4.4247" error={fieldErrors.latitude} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Input label="Longitude" value={form.longitude} onChangeText={set("longitude")} keyboardType="numbers-and-punctuation" placeholder="-41.4586" error={fieldErrors.longitude} />
                    </View>
                </View>
                <Input label="WhatsApp" value={form.whatsapp} onChangeText={set("whatsapp")} keyboardType="phone-pad" placeholder="+55 (86) 99999-0000" error={fieldErrors.whatsapp} />
                <Input label="Instagram" value={form.instagram} onChangeText={set("instagram")} autoCapitalize="none" placeholder="@usuario" error={fieldErrors.instagram} />
                <Input label="Horário" value={form.openingHours} onChangeText={set("openingHours")} placeholder="Seg a Sáb, 11h às 22h" error={fieldErrors.openingHours} />
                <ChipSelect
                    label="Faixa de preço"
                    options={PRICE_OPTIONS}
                    value={form.priceRange}
                    onChange={(priceRange) => setForm((f) => ({ ...f, priceRange }))}
                    error={fieldErrors.priceRange}
                />
                <Input label="Destaques" value={form.highlights} onChangeText={set("highlights")} multiline placeholder="Cozinha regional, música ao vivo" error={fieldErrors.highlights} />

                {error && <Text style={styles.errorText}>{error}</Text>}

                <Button title={isEditing ? "Salvar" : "Criar e adicionar fotos"} onPress={handleSave} loading={saving} />
            </ScrollView>
        </View>
    );
};
```

- [ ] **Step 4: Item no menu e rotas**

Em `src/pages/admin/AdminMenu/index.tsx`, adicione ao array `ITEMS`:

```tsx
    { title: "Estabelecimentos", subtitle: "Hospedagens e restaurantes", icon: "home", route: "AdminEstablishments" },
```

Em `src/AppRoutes.tsx`, adicione os imports:

```tsx
import { AdminEstablishments } from './pages/admin/AdminEstablishments';
import { AdminEstablishmentForm } from './pages/admin/AdminEstablishmentForm';
```

Troque `AdminPhotos: { kind: "attraction" | "event"; id: string };` por:

```tsx
    AdminPhotos: { kind: "attraction" | "event" | "establishment"; id: string };
```

Depois de `AdminGuideForm: { id?: string };` adicione:

```tsx
    AdminEstablishments: undefined;
    AdminEstablishmentForm: { id?: string };
```

No fragmento de admin, depois de `<Stack.Screen name="AdminGuideForm" ... />`:

```tsx
                                <Stack.Screen name="AdminEstablishments" component={AdminEstablishments} />
                                <Stack.Screen name="AdminEstablishmentForm" component={AdminEstablishmentForm} />
```

- [ ] **Step 5: Typecheck, export e commit**

```powershell
npx tsc --noEmit
npx expo export --platform android --output-dir "C:\Users\vitpe\AppData\Local\Temp\claude\expo-export-check"
Remove-Item -Recurse -Force "C:\Users\vitpe\AppData\Local\Temp\claude\expo-export-check"
git add -A
git commit -m "feat: admin de estabelecimentos com filtro por tipo e fotos"
```

---

## Task 6: Verificação em dispositivo (manual)

Com o servidor no ar e `EXPO_PUBLIC_API_URL` apontando para ele:

- [ ] Hospedagem e Restaurantes começam com "Nenhuma hospedagem cadastrada ainda." e "Nenhum restaurante cadastrado ainda.".
- [ ] Admin → Estabelecimentos: criar um restaurante sem faixa de preço mostra o erro no chip; com tudo válido leva às fotos. Adicionar foto. Na Home, Restaurantes mostra o card com foto, "$$" e endereço.
- [ ] Detalhe: mapa, tipo e preço, "Chamar no WhatsApp" abre o app com a mensagem citando o nome, "Ver no Instagram" só aparece se houver handle.
- [ ] Filtro na lista de admin alterna entre Todos, Hospedagem e Restaurantes. Guias continuam funcionando (links de WhatsApp e Instagram nos cards).

---

## Self-review

**Cobertura do spec:**

| Seção | Task |
|---|---|
| 3 Modelo, validação, contatos compartilhados | 1, 2 |
| 4 Rotas e cache | 2, 3 |
| 5 Estrutura, testes, docs | 1, 2, 3 |
| 6 App turista | 4 |
| 7 App admin | 5 |

**Consistência de nomes:** `whatsappSchema`, `instagramSchema`, `normalizeWhatsapp`, `normalizeInstagram`; `establishmentFieldsSchema`, `createEstablishmentSchema`, `establishmentIdParamsSchema`, `establishmentPhotoParamsSchema`, `establishmentListQuerySchema`, `establishmentCoverSchema`; `EstablishmentsRepository` com a mesma interface de `EventsRepository`; `EstablishmentsService.list/getById/create/update/remove/addPhoto/removePhoto/setCover`, `establishmentPhotosDir`; `createEstablishmentsRouter(service, tokens)`. App: `contacts.whatsappUrl/instagramUrl`; `establishmentsApi.*`, `PRICE_RANGE_LABEL`, `ESTABLISHMENT_TYPE_LABEL`; `Card` props `price`, `address`; rotas `EstablishmentDetails`, `AdminEstablishments`, `AdminEstablishmentForm`; `AdminPhotos.kind` com `"establishment"`.

**Contagens:** unitários 92 → 93 (Task 1) → 105 (Task 2, mais 12); e2e 38 → 45; OpenAPI 19 → 24 paths.
