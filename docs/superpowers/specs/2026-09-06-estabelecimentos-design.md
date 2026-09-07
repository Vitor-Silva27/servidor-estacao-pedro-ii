# Módulo de estabelecimentos — Estação Pedro II

Data: 2026-09-06
Status: aprovado para planejamento
Depende de: fundação, atrações, eventos e guias

## 1. Contexto

As categorias Hospedagem e Restaurantes do app mostram "Em breve". Este módulo coloca no servidor os **estabelecimentos**, negócios que o turista contrata: pousadas, hotéis, restaurantes e lanchonetes. Eles têm contato, faixa de preço e horário, coisas que atrações não têm, por isso são um recurso próprio e não um tipo de `Attraction`.

Hospedagem e restaurante compartilham todos os campos; o que os diferencia cabe em `highlights` em texto livre. Um módulo com `type`, como atrações.

## 2. Decisões

| Tema | Decisão |
|---|---|
| Modelo | `Establishment` com `type` HOSPEDAGEM ou RESTAURANTE; campos iguais para os dois |
| Contato | `whatsapp` obrigatório e `instagram` opcional, normalizados como em guias |
| Preço | `priceRange` enum BAIXO, MEDIO, ALTO, mostrado como $, $$, $$$ |
| Fotos | Galeria com capa via o photo manager compartilhado |
| Contatos compartilhados | Normalização e schemas movidos para `src/shared/contacts.ts`; links movidos para `src/services/contacts.ts` no app |
| Seed | Nenhum. Não há dado real |
| Admin no app | Lista com filtro por tipo, formulário, fotos pela tela genérica |

## 3. Modelo de dados

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

Validação (zod):

- `fieldsSchema` (criar e editar): `name` 2 a 120; `description` mínimo 10; `latitude` e `longitude` nos limites; `address` mínimo 3; `whatsapp` via `whatsappSchema` compartilhado (só dígitos, 12 ou 13); `instagram` via `instagramSchema` compartilhado, opcional; `openingHours` e `highlights` opcionais, texto não vazio; `priceRange` enum. Objeto estrito.
- `createSchema` = `fieldsSchema` mais `type` enum.
- `PUT` não recebe `type`; chave desconhecida dá 400. Opcionais ausentes viram `null`.

### Contatos compartilhados

`src/shared/contacts.ts` exporta `normalizeWhatsapp`, `normalizeInstagram`, `whatsappSchema` e `instagramSchema`. `guides.schemas.ts` passa a usá-los. Os testes de normalização saem de `guides.service.test.ts` para `src/shared/contacts.test.ts`. Comportamento inalterado; e2e de guias continua verde.

## 4. Rotas

Prefixo `/api/v1/establishments`. Leitura pública; escrita `authenticate` + `authorize("ADMIN")`.

| Método | Rota | Comportamento |
|---|---|---|
| GET | `/` | Query `type` opcional. Ordena por `name`. Item: `{ id, type, name, coverUrl, priceRange, address }` |
| GET | `/:id` | Detalhe: todos os campos, `coverUrl`, `photos` ordenadas por `position`. 404 se não existe |
| POST | `/` | Cria. 201 |
| PUT | `/:id` | Atualiza campos (tudo menos `type`). 200 |
| DELETE | `/:id` | Apaga registro, fotos e `uploads/establishments/<id>`. 204 |
| POST | `/:id/photos` | Multipart `file`. Primeira vira capa. 201 |
| DELETE | `/:id/photos/:photoId` | Remove; se era capa, a de menor `position` assume. 404 se não pertence. 204 |
| PUT | `/:id/cover` | `{ photoId }`. 404 se não pertence. 200 |

Cache: `establishments:list:<type>` ou `establishments:list:all`, e `establishments:<id>`, TTL 60 s. Toda escrita apaga `list:all`, `list:<type>` e `<id>`.

## 5. Estrutura no servidor

```
src/shared/contacts.ts
src/shared/contacts.test.ts
src/modules/establishments/
  establishments.routes.ts
  establishments.controller.ts
  establishments.service.ts        # cache, delegação de fotos ao manager
  establishments.repository.ts
  establishments.schemas.ts
  establishments.service.test.ts
tests/e2e/establishments.e2e.test.ts
```

`EstablishmentsService` recebe `EstablishmentsRepository`, `Cache` e `PhotoManager` (com `establishmentPhotosDir`). Mesma forma de `EventsService`.

### Testes

Unitários: `contacts.test.ts` com os casos de normalização (WhatsApp mascarado, sem DDI, Instagram com `@` e espaço, inválido). `establishments.service.test.ts`: lista por tipo com cache hit e miss, detalhe com fotos e datas ISO, create normalizando opcionais e invalidando três chaves, update sem `type`, remove chamando `removeAll`, delegação de `addPhoto`, `removePhoto` e `setCover`. `guides.service.test.ts` perde o `describe("guideSchema")`, que vai para `contacts.test.ts` adaptado.

E2E: lista pública vazia; 401 e 403; criar hospedagem e restaurante com WhatsApp mascarado, resposta normalizada; `?type=RESTAURANTE` devolve só o restaurante; `PUT` com `type` no body dá 400 e com Instagram "@X" devolve "X"; upload vira capa e o arquivo é servido; `DELETE` remove a pasta. `setup.ts` trunca também `"EstablishmentPhoto"` e `"Establishment"`.

### Docs

OpenAPI: tag Establishments, 8 paths, schemas `EstablishmentType`, `PriceRange`, `EstablishmentSummary`, `Establishment`, `EstablishmentFields`, `EstablishmentInput`, parâmetro `EstablishmentId`. README: seção Estabelecimentos e roteiro.

## 6. App, turista

- `src/services/contacts.ts`: `whatsappUrl(whatsapp, subject)` e `instagramUrl(handle)` movidos de `guidesApi.ts`; `guidesApi.ts` deixa de exportá-los, e `GuideCards` importa de `contacts.ts`.
- `src/services/establishmentsApi.ts`: tipos `EstablishmentType`, `PriceRange`, `EstablishmentSummary`, `Establishment`, `EstablishmentInput`; `PRICE_RANGE_LABEL` (`BAIXO` "$", `MEDIO` "$$", `ALTO` "$$$"), `ESTABLISHMENT_TYPE_LABEL`; `listEstablishments(type?)`, `getEstablishment`, `createEstablishment(type, input)`, `updateEstablishment`, `deleteEstablishment`, `uploadEstablishmentPhoto`, `deleteEstablishmentPhoto`, `setEstablishmentCover`.
- **Home**: `CATEGORY_ESTABLISHMENT_TYPE` mapeia Hospedagem e Restaurantes; terceiro `useRequest`; `Card` recebe `price={PRICE_RANGE_LABEL[...]}` e `address`, ambos props novas opcionais do `Card` renderizadas na linha de info com ícones `dollar-sign` e `map-pin`; navega para `EstablishmentDetails`. O texto "Em breve" some.
- **EstablishmentDetails**: mapa, nome, linha com tipo e faixa de preço, botões "WhatsApp" e "Instagram" (este só se houver handle) usando `Button` e os helpers de `contacts.ts`, galeria, seções descrição, destaques, horário, endereço. Usa `detailsStyles`.

## 7. App, admin

- `AdminMenu` ganha o item Estabelecimentos → `AdminEstablishments`.
- **AdminEstablishments**: `ChipSelect` com Todos, Hospedagem, Restaurantes filtrando `listEstablishments(type?)`; itens com capa, nome e tipo; criar, editar, apagar com confirmação, botão de fotos → `AdminPhotos` com `kind: "establishment"`.
- **AdminEstablishmentForm**: tipo (chips, só na criação), nome, descrição, endereço, latitude, longitude, WhatsApp, Instagram, horário, faixa de preço (`ChipSelect` $, $$, $$$), destaques. Erros por campo de `details`. Após criar, `replace("AdminPhotos", { kind: "establishment", id })`; após editar, `goBack`.
- `AdminPhotos`: `PhotoOwnerKind` ganha `"establishment"` e o mapa `SOURCES` ganha a entrada correspondente.
- Rotas: `EstablishmentDetails: { id }`, `AdminEstablishments`, `AdminEstablishmentForm: { id? }`; `AdminPhotos.kind` aceita o terceiro valor.

## 8. Fora do escopo

- Reservas, cardápio, avaliações.
- Ligação entre estabelecimento e atração ou evento.
- Seed.

## 9. Ordem de implementação

1. Servidor: `shared/contacts.ts` com testes e refactor de guias (e2e de guias continua verde).
2. Servidor: schema, migration, schemas, repository, service com testes.
3. Servidor: rotas, OpenAPI, e2e, README.
4. App turista: `contacts.ts`, serviço, `Card` com preço e endereço, Home, `EstablishmentDetails`.
5. App admin: lista, formulário, `AdminPhotos` com o terceiro `kind`, menu e rotas.
