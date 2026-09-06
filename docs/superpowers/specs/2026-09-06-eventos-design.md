# Módulo de eventos — Estação Pedro II

Data: 2026-09-06
Status: aprovado para planejamento
Depende de: fundação e atrações (`2026-09-06-fundacao-backend-design.md`, `2026-09-06-atracoes-design.md`)

## 1. Contexto

O app tem um único evento estático, o Festival de Inverno, com data em texto livre, sem detalhe e com descrição copiada de uma cachoeira. Este módulo coloca eventos no servidor com período real, localização e fotos, e faz o app ler e administrar.

A lógica de fotos com capa já existe em atrações. Este módulo a extrai para um helper compartilhado, sem mudar o comportamento das atrações.

## 2. Decisões

| Tema | Decisão |
|---|---|
| Data | `startsAt` e `endsAt` reais, mais `dateNote` opcional em texto livre |
| Lista do turista | Só eventos com `endsAt >= agora`, ordenados por `startsAt` |
| Lista do admin | Tudo, via `scope=all` |
| Localização e fotos | Iguais às atrações: latitude, longitude, galeria com capa |
| Fotos | Tabela `EventPhoto` própria; regras de capa em `src/shared/photos/photos.ts`, usado por atrações e eventos |
| Admin no app | Menu de admin com Atrações e Eventos; tela de fotos genérica |
| Seed | Festival de Inverno com imagem |

## 3. Modelo de dados

```prisma
model Event {
  id           String       @id @default(uuid())
  name         String
  description  String
  startsAt     DateTime
  endsAt       DateTime
  dateNote     String?
  latitude     Float
  longitude    Float
  address      String?
  tips         String?
  coverPhotoId String?      @unique
  coverPhoto   EventPhoto?  @relation("EventCover", fields: [coverPhotoId], references: [id], onDelete: SetNull)
  photos       EventPhoto[] @relation("EventGallery")
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
}

model EventPhoto {
  id        String   @id @default(uuid())
  eventId   String
  event     Event    @relation("EventGallery", fields: [eventId], references: [id], onDelete: Cascade)
  coverOf   Event?   @relation("EventCover")
  url       String
  position  Int
  createdAt DateTime @default(now())
}
```

Validação (zod, um schema só para criar e editar):

- `name` 2 a 120; `description` mínimo 10; `startsAt` e `endsAt` strings ISO 8601 convertidas para `Date`, com `endsAt >= startsAt` (refine, erro no campo `endsAt`); `latitude` -90 a 90; `longitude` -180 a 180; `dateNote`, `address`, `tips` opcionais, texto não vazio quando presentes.
- Opcionais ausentes viram `null` no banco, como nas atrações.

## 4. Rotas

Prefixo `/api/v1/events`. Leitura pública; escrita com `authenticate` + `authorize("ADMIN")`.

| Método | Rota | Comportamento |
|---|---|---|
| GET | `/` | Query `scope` = `upcoming` (padrão) ou `all`. `upcoming` filtra `endsAt >= agora`. Ordena por `startsAt` asc. Item: `{ id, name, coverUrl, startsAt, endsAt, dateNote, address }` |
| GET | `/:id` | Detalhe: todos os campos, `coverUrl`, `photos` ordenadas por `position`. 404 se não existe |
| POST | `/` | Cria. 201 |
| PUT | `/:id` | Atualiza. 200 |
| DELETE | `/:id` | Apaga registro, fotos e `uploads/events/<id>`. 204 |
| POST | `/:id/photos` | Multipart `file`. Primeira foto vira capa. 201 |
| DELETE | `/:id/photos/:photoId` | Remove; se era capa, a de menor `position` assume. 404 se não pertence. 204 |
| PUT | `/:id/cover` | `{ photoId }`. 404 se não pertence. 200 |

Datas na resposta em ISO 8601 (string). Arquivos em `uploads/events/<id>/`, mesmo middleware `uploadImage` e mesmo `Storage`.

Cache: chaves `events:list:upcoming`, `events:list:all`, `events:<id>`, TTL 60 s. Toda escrita apaga as três.

## 5. Helper de fotos

`src/shared/photos/photos.ts`:

```ts
export type PhotoRow = { id: string; url: string; position: number };
export type PhotoOwner = { id: string; coverPhotoId: string | null; photos: PhotoRow[] };
export type PhotoRepository = {
  addPhoto(ownerId: string, url: string): Promise<PhotoRow>;
  deletePhoto(photoId: string): Promise<void>;
  setCover(ownerId: string, photoId: string | null): Promise<unknown>;
};
export type PhotoInput = { buffer: Buffer; ext: string };

export function createPhotoManager(repo: PhotoRepository, storage: Storage, dirFor: (ownerId: string) => string) {
  return {
    add(owner: PhotoOwner, photo: PhotoInput): Promise<PhotoRow>;      // salva, cria, vira capa se não havia
    remove(owner: PhotoOwner, photoId: string): Promise<void>;         // 404 se não pertence; promove ou null se era capa; apaga arquivo
    setCover(owner: PhotoOwner, photoId: string): Promise<void>;       // 404 se não pertence
    removeAll(ownerId: string): Promise<void>;                         // storage.removeDir(dirFor(ownerId))
  };
}
```

`AttractionsService` passa a construir um `createPhotoManager(repo, storage, id => \`attractions/${id}\`)` e delega `addPhoto`, `removePhoto`, `setCover` e a remoção da pasta em `remove`. `AttractionsRepository` já tem os três métodos com essas assinaturas. Rotas, respostas e testes e2e de atrações não mudam.

Testes: `photos.test.ts` recebe os casos de capa (primeira vira capa, segunda não muda, apagar capa promove a de menor posição, apagar a última deixa null, apagar outra não mexe na capa, foto de outro dono dá 404 em remove e setCover, removeAll chama removeDir). Em `attractions.service.test.ts`, os testes de fotos passam a verificar a delegação (o manager é mockado) e a invalidação de cache.

## 6. Estrutura no servidor

```
src/modules/events/
  events.routes.ts
  events.controller.ts
  events.service.ts
  events.repository.ts
  events.schemas.ts
  events.service.test.ts
src/shared/photos/
  photos.ts
  photos.test.ts
prisma/seed/events.ts
prisma/seed/images/festivalInverno.jpg
tests/e2e/events.e2e.test.ts
```

`EventsService` recebe `EventsRepository`, `Cache` e o photo manager pelo construtor. `EventsRepository.findMany(scope, now)` recebe o relógio como parâmetro para o teste unitário não depender da hora.

### Seed

`prisma/seed/events.ts`, chamado depois de `seedAttractions` em `prisma/seed.ts`. Um evento:

- Festival de Inverno de Pedro II. Período 2027-07-01 a 2027-07-31. `dateNote` "Acontece todo ano entre junho e julho". Localização no centro de Pedro II (-4.4247, -41.4586). `address` "Centro, Pedro II". Descrição própria sobre o festival de música, arte e gastronomia que aproveita o clima frio da serra. Foto `festivalInverno.jpg` copiada do app.
- Idempotente por nome.

### Testes

Unitários: `events.service.test.ts` cobre lista `upcoming` passando `now` para o repo, lista `all`, cache hit e miss, criação com invalidação, `endsAt` antes de `startsAt` rejeitado pelo schema, remoção chamando `removeAll`, delegação de fotos ao manager.

E2E `events.e2e.test.ts`: lista pública vazia; 401 sem token e 403 com turista; criar evento futuro; período invertido dá 400 no campo `endsAt`; criar evento passado e conferir que aparece só em `scope=all`; upload vira capa e o arquivo é servido; apagar evento remove a pasta. `setup.ts` trunca também `"EventPhoto"` e `"Event"`.

### Docs

OpenAPI: tag Events, 8 paths, schemas `EventSummary`, `Event`, `EventInput`, `EventPhoto`, parâmetro `EventId`. README: seção Eventos e roteiro atualizado.

## 7. App, turista

- `src/services/eventsApi.ts`: tipos `EventSummary`, `Event`, `EventInput`; `listEvents(scope?)`, `getEvent`, `createEvent`, `updateEvent`, `deleteEvent`, `uploadEventPhoto`, `deleteEventPhoto`, `setEventCover`. Helper `formatPeriod(startsAt, endsAt)`: "12 a 20 de julho de 2027", ou "12 de julho de 2027" quando é um dia só, ou "30 de junho a 2 de julho de 2027" quando cruza mês.
- **Home**: categoria Eventos busca `listEvents()` com `useRequest`, mesmos estados de loading, erro e vazio. `Card` recebe `date={formatPeriod(...)}` e navega para `EventDetails`.
- **EventDetails**: mapa com marcador, nome, período e `dateNote` em destaque, galeria, seções descrição, endereço e dicas quando existem. Mesmo esqueleto e estilos de `AttractionDetails`; os estilos comuns vão para `src/pages/details.styles.ts` compartilhado pelas duas telas.
- Removidos `src/data/event.ts` e `src/shared/Assets/Images/festivalInverno.jpg`.

## 8. App, admin

- **AdminMenu**: a engrenagem da Home leva a um menu com dois itens, Atrações e Eventos.
- **AdminEvents**: lista `listEvents("all")` com capa, nome, período, e selo "Encerrado" quando `endsAt < agora`. Criar, editar, apagar com confirmação, e botão de fotos.
- **AdminEventForm**: nome, descrição (multiline), início e fim como `Input` texto `AAAA-MM-DD` (convertidos para ISO com hora 00:00 e 23:59 local ao enviar; ao editar, mostrados no mesmo formato), nota de data, latitude, longitude, endereço, dicas. Erros por campo vindos de `details`. Depois de criar, vai para as fotos; depois de editar, volta.
- **AdminPhotos** (renomeada de `AdminAttractionPhotos`): recebe `{ kind: "attraction" | "event", id }`. Um mapa interno escolhe o conjunto de funções `{ get, upload, remove, setCover }` pelo `kind`. Params continuam serializáveis, como o React Navigation exige. `AdminAttractions` e `AdminAttractionForm` passam a navegar para `AdminPhotos` com `kind: "attraction"`.
- Rotas novas: `EventDetails: { id }`, `AdminMenu`, `AdminEvents`, `AdminEventForm: { id? }`, `AdminPhotos: { kind, id }`. `AdminAttractionPhotos` deixa de existir.

## 9. Fora do escopo

- Seletor nativo de data.
- Recorrência automática de eventos anuais.
- Notificações ou lembretes.
- Categorias de evento.

## 10. Ordem de implementação

1. Servidor: helper de fotos com testes e refactor de atrações (sem mudar comportamento; e2e de atrações continuam verdes).
2. Servidor: schema, módulo de eventos com testes unitários.
3. Servidor: rotas, OpenAPI, seed, e2e, README.
4. App turista: serviço, Home, `EventDetails`, remoção do estático.
5. App admin: menu, `AdminPhotos` genérica, `AdminEvents`, `AdminEventForm`.
