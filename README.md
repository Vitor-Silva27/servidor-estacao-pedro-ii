# Servidor Estação Pedro II

API do app **Estação Pedro II**, um guia turístico da cidade de Pedro II, Piauí. O app (Expo/React Native) vive em outro repositório e consome esta API.

## Stack

- Node 22, TypeScript, Express 5
- PostgreSQL 16 via Prisma 7
- Redis 7 (sessões de refresh token e cache)
- Autenticação JWT com refresh token rotativo
- Validação com zod
- Testes com Jest, ts-jest e supertest
- Documentação OpenAPI em `docs/openapi.yaml`, servida em `/docs`
- Docker e Docker Compose

## Pré-requisitos

- Node 22+
- Docker Desktop

## Rodando em desenvolvimento

```bash
cp .env.example .env        # ajuste os segredos se quiser
npm install
docker compose up -d --wait postgres redis
npx prisma generate
npx prisma migrate dev
npm run prisma:seed          # cria o admin do .env
npm run dev
```

A API sobe em `http://localhost:3333`. O Swagger fica em `http://localhost:3333/docs`.

O Postgres de desenvolvimento é exposto na porta **5434** do host (não 5432), porque a 5432 costuma estar ocupada por um Postgres nativo no Windows. O `.env.example` já aponta para essa porta.

Para rodar tudo dentro do Docker, inclusive a API com hot reload:

```bash
docker compose up --build
```

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `NODE_ENV` | `development`, `test` ou `production` |
| `PORT` | Porta da API |
| `DATABASE_URL` | Conexão Postgres. No `.env` usa `localhost:5434`; dentro do Compose é sobrescrita para o serviço `postgres` |
| `REDIS_URL` | Conexão Redis. Mesma regra acima |
| `JWT_ACCESS_SECRET` | Segredo do access token |
| `JWT_REFRESH_SECRET` | Segredo do refresh token |
| `JWT_ACCESS_EXPIRES` | Validade do access token (`15m`) |
| `JWT_REFRESH_EXPIRES` | Validade do refresh token (`7d`) |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin criado pelo seed |
| `UPLOADS_DIR` | Pasta das fotos, relativa à raiz do projeto (`uploads`) |

## Níveis de acesso

| Nível | Como obtém | O que pode |
|---|---|---|
| Convidado | Nenhum token | Ler o conteúdo público |
| `TOURIST` | `POST /api/v1/auth/register` | O mesmo que o convidado, mais o próprio perfil |
| `ADMIN` | Criado pelo seed | Gerenciar conteúdo (rotas de escrita dos módulos) |

## Autenticação

1. `POST /api/v1/auth/login` ou `/register` devolve `accessToken` (15 min) e `refreshToken` (7 dias).
2. Envie `Authorization: Bearer <accessToken>` nas rotas protegidas.
3. Quando o access expirar, `POST /api/v1/auth/refresh` com o `refreshToken` devolve um par novo. O refresh usado é invalidado (rotação).
4. `POST /api/v1/auth/logout`, com `Authorization: Bearer` e o `refreshToken` no body, revoga o refresh token.

Refresh tokens ficam no Redis com TTL. Não existem no Postgres.

## Atrações

Cachoeiras e pontos turísticos são o mesmo recurso, `Attraction`, com `type` igual a `CACHOEIRA` ou `PONTO_TURISTICO`. Cachoeiras exigem `trailDistance`, `trailTime` e `trailLevel`; pontos turísticos aceitam `openingHours` e `price`. Campos do outro tipo são rejeitados com 400.

Leitura é pública. Escrita exige `ADMIN`.

| Método | Rota | Faz |
|---|---|---|
| GET | `/api/v1/attractions?type=` | Lista resumida, ordenada por nome |
| GET | `/api/v1/attractions/:id` | Detalhe com fotos |
| POST | `/api/v1/attractions` | Cria |
| PUT | `/api/v1/attractions/:id` | Atualiza (o tipo não muda) |
| DELETE | `/api/v1/attractions/:id` | Apaga registro, fotos e arquivos |
| POST | `/api/v1/attractions/:id/photos` | Upload multipart no campo `file` (JPEG, PNG ou WebP até 5 MB). A primeira foto vira capa |
| DELETE | `/api/v1/attractions/:id/photos/:photoId` | Remove a foto; se era capa, a próxima assume |
| PUT | `/api/v1/attractions/:id/cover` | Define a capa com `{ photoId }` |

Fotos ficam em `uploads/attractions/<id>/` e são servidas em `/uploads/...`. As URLs no banco são relativas; o app prefixa com a URL da API. `UPLOADS_DIR` no `.env` muda a pasta (os testes usam `uploads-test`).

Listagem e detalhe ficam em cache no Redis por 60 segundos. Toda escrita invalida.

O seed (`npm run prisma:seed`) cria o admin e as cinco atrações que existiam no app, com fotos. As coordenadas das cachoeiras são aproximadas; corrija pelo app.

## Estrutura

```
prisma/               schema, migrations e seed
docs/openapi.yaml     documentação da API
docs/superpowers/     specs e planos de design
uploads/              fotos enviadas (gitignored; no Docker vem do bind mount)
src/
  app.ts              composição: middlewares, rotas, swagger, error handler
  server.ts           sobe a porta
  config/env.ts       variáveis de ambiente validadas
  types/express.d.ts  adiciona req.user ao tipo do Express
  lib/                clientes Prisma e Redis
  shared/
    errors/           AppError e subclasses
    middlewares/      errorHandler, validate, authenticate, authorize
    cache/            helper de cache no Redis
    storage/          interface Storage e implementação em disco
  modules/
    health/
    users/
    auth/
    attractions/      cachoeiras e pontos turísticos, com fotos
tests/e2e/            testes de ponta a ponta
```

## Padrão de módulo

Módulos com rotas próprias (como `auth`) são uma pasta em `src/modules/<nome>` com:

| Arquivo | Papel |
|---|---|
| `<nome>.routes.ts` | `Router`. Só mapeia rota → middlewares → controller |
| `<nome>.controller.ts` | Lê `req`, chama o service, escreve `res`. Sem regra de negócio |
| `<nome>.service.ts` | Regras de negócio. Recebe dependências pelo construtor |
| `<nome>.repository.ts` | Acesso ao Prisma. Único lugar que conhece o banco |
| `<nome>.schemas.ts` | Schemas zod de entrada e tipos derivados |
| `<nome>.service.test.ts` | Teste unitário, com repository e Redis mockados |

Para criar um módulo novo:

1. Adicione o model em `prisma/schema.prisma` e rode `npx prisma migrate dev --name <nome>` e `npx prisma generate`.
2. Crie a pasta com os arquivos acima. Comece pelo teste do service.
3. Exponha uma função `create<Nome>Router(...)` que recebe suas dependências como argumentos e monte em `src/app.ts` sob `/api/v1/<nome>`.
4. Rotas de leitura não usam `authenticate`. Rotas de escrita usam `authenticate(tokens)` seguido de `authorize("ADMIN")`.
5. Documente os paths em `docs/openapi.yaml`.
6. Adicione um `tests/e2e/<nome>.e2e.test.ts`.

## Erros

Toda resposta de erro tem o mesmo formato:

```json
{ "error": { "code": "NOT_FOUND", "message": "Usuário não encontrado" } }
```

Códigos: `VALIDATION_ERROR` (400, com `details`), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500).

Para lançar um erro, use as classes em `src/shared/errors/AppError.ts`. O `errorHandler` converte.

## Testes

```bash
npm test          # unitários, sem infra
npm run test:e2e  # sobe postgres-test e redis-test, roda, derruba
```

Os e2e usam `.env.test` (portas 5433 e 6380) e limpam o banco e o Redis antes de cada arquivo. Se um e2e falhar, a infra fica no ar para investigação; derrube com `npm run test:e2e:down`, que remove só os containers de teste (`postgres-test` e `redis-test`) e não mexe no `postgres` e no `redis` de desenvolvimento.

## Scripts

| Script | Faz |
|---|---|
| `npm run dev` | API com hot reload |
| `npm run build` | Gera o Prisma Client e compila para `dist/` |
| `npm start` | Roda `dist/server.js` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Testes unitários |
| `npm run test:e2e` | Testes e2e com infra Docker |
| `npm run prisma:migrate` | Cria e aplica migration em dev |
| `npm run prisma:seed` | Cria o admin |
| `npm run prisma:studio` | Abre o Prisma Studio |

## Roteiro de módulos

1. Fundação (auth, infra, testes) — concluído
2. Atrações: cachoeiras e pontos turísticos, com upload de imagem e cache — concluído
3. Eventos
4. Guias, com WhatsApp e Instagram
5. Hospedagem e restaurantes
6. Favoritos e salvos do turista

Os specs de design ficam em `docs/superpowers/specs`.
