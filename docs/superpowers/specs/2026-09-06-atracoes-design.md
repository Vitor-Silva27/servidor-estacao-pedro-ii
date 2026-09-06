# Módulo de atrações — Estação Pedro II

Data: 2026-09-06
Status: aprovado para planejamento
Depende de: fundação (`2026-09-06-fundacao-backend-design.md`)

## 1. Contexto

A fundação entregou auth, infra e a integração mínima do app. O conteúdo do app ainda é estático. Este módulo coloca no servidor as **atrações**: cachoeiras e pontos turísticos, com fotos, e faz o app ler e administrar esse conteúdo.

Cachoeiras e pontos turísticos são o mesmo domínio, "um lugar para visitar", diferindo em poucos campos. Por isso um módulo único com `type`, em vez de um módulo por categoria.

## 2. Decisões

| Tema | Decisão |
|---|---|
| Modelo | `Attraction` com `type` enum; campos específicos opcionais validados por tipo |
| Fotos | Tabela `AttractionPhoto`; `coverPhotoId` na atração |
| Upload | Uma foto por request, multipart, salva em `uploads/attractions/<id>/`; URL relativa no banco |
| Arquivos | Disco local servido por `express.static`; interface `Storage` para trocar depois |
| Cache | Leituras com TTL 60 s; escritas invalidam |
| Admin | Telas no app, visíveis só para `ADMIN`, CRUD completo com confirmação para apagar |
| Seed | Carrega as 5 atrações atuais do app e suas imagens |
| App | Dados estáticos dessas categorias removidos; uma tela de detalhe para os dois tipos |

## 3. Modelo de dados

```prisma
enum AttractionType {
  CACHOEIRA
  PONTO_TURISTICO
}

enum TrailLevel {
  FACIL
  MEDIA
  DIFICIL
}

model Attraction {
  id            String           @id @default(uuid())
  type          AttractionType
  name          String
  description   String
  latitude      Float
  longitude     Float
  tips          String?
  howToGet      String?
  trailDistance String?          // só CACHOEIRA, texto livre: "2,3km"
  trailTime     String?          // só CACHOEIRA, texto livre: "45min"
  trailLevel    TrailLevel?      // só CACHOEIRA
  openingHours  String?          // só PONTO_TURISTICO, texto livre: "08:00 às 17:00"
  price         String?          // só PONTO_TURISTICO, texto livre: "Entrada gratuita"
  coverPhotoId  String?          @unique
  coverPhoto    AttractionPhoto? @relation("Cover", fields: [coverPhotoId], references: [id], onDelete: SetNull)
  photos        AttractionPhoto[] @relation("Gallery")
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
}

model AttractionPhoto {
  id           String     @id @default(uuid())
  attractionId String
  attraction   Attraction @relation("Gallery", fields: [attractionId], references: [id], onDelete: Cascade)
  coverOf      Attraction? @relation("Cover")
  url          String
  position     Int
  createdAt    DateTime   @default(now())
}
```

Regras de validação (zod, no service via schema por tipo):

- Todos: `name` (2 a 120), `description` (mínimo 10), `latitude` (-90 a 90), `longitude` (-180 a 180), `tips` e `howToGet` opcionais.
- `CACHOEIRA`: `trailDistance`, `trailTime`, `trailLevel` obrigatórios; `openingHours` e `price` proibidos.
- `PONTO_TURISTICO`: `openingHours` e `price` opcionais; campos de trilha proibidos.
- `type` não muda depois de criado. O body do `PUT` não tem `type`; o service valida os campos contra o `type` gravado no banco.

## 4. Rotas

Prefixo `/api/v1/attractions`. Leitura pública; escrita com `authenticate(tokens)` + `authorize("ADMIN")`.

| Método | Rota | Acesso | Comportamento |
|---|---|---|---|
| GET | `/` | público | Lista. Query `type` opcional (`CACHOEIRA` ou `PONTO_TURISTICO`). Ordena por `name`. Item: `{ id, type, name, coverUrl, trailDistance, trailTime, trailLevel }` |
| GET | `/:id` | público | Detalhe: todos os campos, `coverUrl`, `photos: [{ id, url, position }]` ordenadas por `position`. 404 se não existe |
| POST | `/` | admin | Cria. 201 com o detalhe |
| PUT | `/:id` | admin | Atualiza campos editáveis (tudo menos `type`). 200 com o detalhe |
| DELETE | `/:id` | admin | Apaga registro, fotos (cascade) e a pasta `uploads/attractions/<id>`. 204 |
| POST | `/:id/photos` | admin | Multipart, campo `file`, um arquivo. Salva em `uploads/attractions/<id>/<uuid>.<ext>`, cria `AttractionPhoto` com `position` = maior + 1. Se a atração não tinha capa, esta vira capa. 201 com `{ id, url, position }` |
| DELETE | `/:id/photos/:photoId` | admin | Apaga linha e arquivo. Se era a capa, a foto de menor `position` restante vira capa, ou `coverPhotoId` fica `null`. 404 se a foto não pertence à atração. 204 |
| PUT | `/:id/cover` | admin | Body `{ photoId }`. 404 se não pertence. 200 com o detalhe |

`coverUrl` é derivado: a `url` da `coverPhoto`, ou `null`.

Sem paginação, sem reordenação de fotos.

### Upload

- `multer` com `memoryStorage`, `limits.fileSize` 5 MB, `fileFilter` aceitando `image/jpeg`, `image/png`, `image/webp`. Extensão gravada a partir do MIME (`jpg`, `png`, `webp`).
- Arquivo ausente, tipo inválido ou tamanho excedido: 400 `VALIDATION_ERROR` com `details: [{ path: "file", message }]`. O erro do multer é convertido no `errorHandler`.
- `app.ts` monta `express.static` em `/uploads` apontando para `<cwd>/uploads`.

### Cache

Helper `createCache(redis)` da fundação, TTL 60 s.

- `GET /` → chave `attractions:list:<type>` ou `attractions:list:all`.
- `GET /:id` → chave `attractions:<id>`.
- Toda escrita apaga `attractions:list:all`, `attractions:list:<type da atração>` e `attractions:<id>`.

## 5. Estrutura no servidor

```
src/modules/attractions/
  attractions.routes.ts
  attractions.controller.ts
  attractions.service.ts        # regras, cache, chama storage
  attractions.repository.ts     # Prisma: Attraction e AttractionPhoto
  attractions.schemas.ts        # zod: create/update por tipo, params, cover, query
  attractions.service.test.ts
src/shared/storage/
  storage.ts                    # interface Storage { save, remove, removeDir }
  localStorage.ts               # implementação em disco sob <cwd>/uploads
  localStorage.test.ts
src/shared/middlewares/
  upload.ts                     # multer configurado; exporta uploadImage (single("file"))
prisma/seed.ts                  # chama seedAdmin e seedAttractions
prisma/seed/admin.ts
prisma/seed/attractions.ts
prisma/seed/images/*.jpg|png    # copiadas do app
uploads/                        # gitignored; volume no Docker
tests/e2e/attractions.e2e.test.ts
tests/e2e/fixtures/pixel.png    # imagem mínima para upload nos e2e
```

Interface de storage:

```ts
export type Storage = {
  save(dir: string, ext: string, data: Buffer): Promise<string>; // devolve a URL relativa
  remove(url: string): Promise<void>;
  removeDir(dir: string): Promise<void>;
};
```

`AttractionsService` recebe `AttractionsRepository`, `Cache` e `Storage` pelo construtor. O controller só traduz `req` e `res`. O router aplica `authenticate`, `authorize("ADMIN")`, `validate` e `uploadImage` conforme a rota.

### Seed

`prisma/seed.ts` chama `seedAdmin()` (o código atual, movido) e `seedAttractions()`. O seed de atrações:

- Insere as 3 cachoeiras e os 2 pontos turísticos que hoje estão em `src/data` do app, com os textos de `common.ts` como `tips` e `howToGet` das cachoeiras. O Memorial recebe descrição própria em vez da cópia do Gritador.
- Copia as imagens de `prisma/seed/images/` para `uploads/attractions/<id>/` e cria as `AttractionPhoto`, marcando a primeira como capa.
- Idempotente: pula qualquer atração cujo `name` já exista.

### Docker

- `docker-compose.yml`: volume nomeado `uploads-data` montado em `/app/uploads` no serviço `api`.
- `Dockerfile` (estágio prod): `RUN mkdir -p uploads`, e copia `prisma/seed` para o seed funcionar na imagem.
- `.gitignore` e `.dockerignore`: `uploads/`.

### Testes

Unitários (`attractions.service.test.ts`, repository, cache e storage mockados):

- Criar cachoeira sem campos de trilha falha; criar ponto turístico com campos de trilha falha.
- Criar e atualizar invalidam as chaves de cache certas.
- Lista e detalhe usam o cache quando há valor e gravam quando não há.
- Primeiro upload vira capa; segundo não muda a capa.
- Apagar a capa promove a de menor `position`; apagar a última deixa `null`.
- Apagar atração chama `storage.removeDir` e invalida cache.
- `setCover` com foto de outra atração dá 404.

`localStorage.test.ts`: grava um buffer num diretório temporário, confere a URL devolvida, remove o arquivo, remove o diretório.

E2E (`attractions.e2e.test.ts`, login com o admin e com um turista):

1. Lista pública sem token, vazia depois do truncate.
2. `POST /` sem token dá 401; com turista dá 403.
3. Admin cria cachoeira válida; cria ponto turístico válido; cachoeira sem trilha dá 400.
4. Lista com `?type=CACHOEIRA` devolve só a cachoeira.
5. Upload de `fixtures/pixel.png` com `.attach("file", ...)` dá 201 e a atração passa a ter `coverUrl`; `GET /uploads/<url>` devolve 200.
6. Segundo upload; `PUT /cover` troca a capa.
7. `DELETE` da capa promove a outra foto.
8. `DELETE` da atração dá 204; `GET /:id` dá 404; a pasta em `uploads` não existe mais.

`setup.ts` passa a truncar também `"Attraction"` e `"AttractionPhoto"`, e a limpar `uploads/attractions` antes de cada arquivo.

### OpenAPI

`docs/openapi.yaml` ganha a tag `Attractions`, os 8 paths, schemas `AttractionSummary`, `Attraction`, `AttractionPhoto`, `AttractionInput` (com `oneOf` por tipo) e `SetCoverInput`, e o `requestBody` multipart do upload.

## 6. App, lado do turista

Branch `joao/changes` no repositório do app.

- `src/services/attractionsApi.ts`: `listAttractions(type?)`, `getAttraction(id)`, tipos `AttractionType`, `TrailLevel`, `AttractionSummary`, `AttractionPhoto`, `Attraction`. Helper `imageUrl(relative)` que prefixa `EXPO_PUBLIC_API_URL`.
- `src/hooks/useRequest.ts`: recebe uma função assíncrona, devolve `{ data, loading, error, reload }`. Refaz a chamada quando as dependências informadas mudam.
- **Home**: para Cachoeiras e Pontos turísticos, busca `listAttractions(type)` com `useRequest`. Mostra `ActivityIndicator` enquanto carrega e uma mensagem com botão "Tentar de novo" em erro. `Card` passa a aceitar `image` como `ImageSourcePropType`, para servir tanto `{ uri }` quanto `require`. Eventos continua estático.
- **AttractionDetails**: substitui `DetailsWaterfall` e `DetailsAttraction`. Recebe `{ id }`, busca `getAttraction(id)`. Layout: mapa com marcador no topo, nome, galeria horizontal das fotos, cards de distância, tempo e nível quando `type === "CACHOEIRA"`, seções de descrição, dicas, como chegar, horário e preço quando existem, e a lista de guias estática como hoje.
- Removidos: `src/data/waterfalls.ts`, `src/data/touristAttractions.ts`, `src/data/common.ts`, as páginas `DetailsWaterfall` e `DetailsAttraction`, e as imagens `saltoLiso`, `urubuRei`, `samambaia`, `morroDoGritador*`, `memorial` de `src/shared/Assets`. Ficam `categories.ts`, `event.ts`, `guides.ts`, `festivalInverno`, `joaoLucas` e o logo.
- Rotas: `AttractionDetails: { id: string }` no lugar das duas anteriores.

## 7. App, lado do admin

Entrada: ícone de engrenagem no header da Home, renderizado só quando `user?.role === "ADMIN"`. As telas de admin ficam no mesmo `Stack.Navigator` do app, registradas só quando o usuário é admin.

- **AdminAttractions**: lista de todas as atrações (`listAttractions()` sem filtro) com capa, nome e tipo. Botão "Nova atração" abre o formulário vazio. Tocar em um item abre o formulário preenchido. Ícone de lixeira em cada item abre `Alert.alert` de confirmação e chama `deleteAttraction`. Botão de fotos em cada item abre o gerenciador.
- **AdminAttractionForm**: recebe `{ id?: string }`. Campos: tipo (chips, editável só na criação), nome, descrição (multiline), latitude, longitude, dicas, como chegar. Se tipo é CACHOEIRA: distância, tempo, nível (chips FÁCIL, MÉDIA, DIFÍCIL). Se PONTO_TURISTICO: horário, preço. Latitude e longitude são `TextInput` numéricos convertidos com `Number`. Ao salvar: `createAttraction` ou `updateAttraction`. Erros `VALIDATION_ERROR` da API são mapeados por `details[].path` para o campo; outros erros aparecem no rodapé. Depois de criar, navega para `AdminAttractionPhotos` da atração nova; depois de editar, volta.
- **AdminAttractionPhotos**: recebe `{ id }`. Grade das fotos com selo "Capa" na capa. Botão "Adicionar foto" chama `expo-image-picker` (`launchImageLibraryAsync`, só imagens, sem edição), envia com `uploadPhoto` e recarrega. Tocar numa foto abre `Alert` com "Definir como capa", "Remover" (com segunda confirmação) e "Cancelar".

Serviços: `attractionsApi.ts` ganha `createAttraction(input)`, `updateAttraction(id, input)`, `deleteAttraction(id)`, `uploadPhoto(id, fileUri, mimeType)`, `deletePhoto(id, photoId)`, `setCover(id, photoId)`. `api.ts` passa a aceitar `body: FormData`, caso em que não define `Content-Type` e envia o `FormData` direto, mantendo Bearer e refresh automático. `ApiError` ganha `details?: { path: string; message: string }[]`.

Componentes novos em `src/shared/Components`: `ChipSelect` (lista de `Chip` com valor selecionado) e `ScreenHeader` (botão voltar e título, usado pelas três telas de admin e por `AttractionDetails`). `Input` ganha suporte a `error?: string` exibido abaixo do campo.

Dependência nova: `expo-image-picker`, instalada com `npx expo install`.

## 8. Fora do escopo

- Reordenar, editar ou comprimir fotos; preview antes do upload.
- Paginação e busca por texto.
- Eventos, guias, hospedagem, restaurantes, favoritos.
- Armazenamento em nuvem.
- Rascunho ou publicação de atrações.

## 9. Ordem de implementação sugerida

1. Servidor: schema, migration, storage, upload middleware, módulo de atrações com testes unitários.
2. Servidor: rotas, static, OpenAPI, seed com imagens, e2e, Docker.
3. App turista: serviços, hook, Home, `AttractionDetails`, remoção do estático.
4. App admin: `api.ts` com FormData, componentes, três telas, navegação.
