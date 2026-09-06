# Fundação do backend — Estação Pedro II

Data: 2026-09-06
Status: aprovado para planejamento

## 1. Contexto

Estação Pedro II é um app Expo (React Native) de guia turístico da cidade de Pedro II, Piauí. Hoje todo o conteúdo (cachoeiras, pontos turísticos, eventos, guias) é estático, embutido no app em `src/Data`. Não há login nem servidor.

Este spec define a **fundação do backend**: o primeiro de uma série de módulos. Ele entrega o esqueleto do servidor, infraestrutura em Docker, autenticação com JWT e refresh token, testes, documentação Swagger e a integração mínima do app com o servidor.

Módulos de conteúdo (cachoeiras, pontos turísticos, eventos, guias, hospedagem, restaurantes) e funcionalidades de turista (favoritos, salvos) terão specs próprios e seguem o padrão definido aqui.

## 2. Decisões

| Tema | Decisão |
|---|---|
| Papéis | Três níveis: convidado (sem token), `TOURIST` e `ADMIN` |
| Turista na fundação | Só cadastro, login e perfil. Vê o mesmo que o convidado |
| Framework HTTP | Express 5 + TypeScript |
| Banco | PostgreSQL 16 via Prisma |
| Redis | Refresh tokens (com TTL) e cache de listagens de conteúdo |
| Imagens | Servidor serve arquivos estáticos; banco guarda URL. Upload entra nos módulos de conteúdo |
| Repositório | Repo git próprio em `servidor-estacao-pedro-ii`, separado do app |
| Testes e2e | Docker Compose com perfil `test`, Jest + supertest |
| Organização | Módulo = pasta com suas camadas dentro. Injeção manual pelo construtor, sem container de DI |
| Docs | `docs/openapi.yaml` escrito à mão, servido em `/docs` |

Princípios: YAGNI, DRY, código legível. Sem abstrações que não tenham um segundo uso concreto.

## 3. Stack

- Node 22, TypeScript, Express 5
- Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`, config em `prisma.config.ts`), ioredis (Redis)
- zod (validação de entrada e de env)
- jsonwebtoken, bcryptjs (mesmo algoritmo do bcrypt, sem módulo nativo)
- swagger-ui-express + `docs/openapi.yaml`
- Jest, ts-jest, supertest
- tsx (dev), Docker + Docker Compose

## 4. Estrutura de pastas

```
servidor-estacao-pedro-ii/
  docker-compose.yml          # api, postgres, redis; perfil "test" com postgres-test e redis-test
  Dockerfile                  # multi-stage: build TS, roda dist/
  .env.example
  README.md
  docs/
    openapi.yaml              # fonte única do Swagger
    superpowers/specs/        # specs de design
  prisma/
    schema.prisma
    migrations/
    seed.ts                   # cria o admin inicial a partir do .env
  src/
    server.ts                 # sobe o app na porta
    app.ts                    # monta Express: middlewares, rotas, swagger, error handler
    config/env.ts             # lê e valida variáveis de ambiente com zod
    lib/prisma.ts             # cliente Prisma singleton
    lib/redis.ts              # cliente Redis singleton
    shared/
      errors/AppError.ts      # erro com statusCode e code; subclasses NotFoundError, UnauthorizedError, ForbiddenError, ConflictError
      middlewares/
        errorHandler.ts       # converte AppError e ZodError em JSON padronizado
        validate.ts           # valida body/params/query com um schema zod
        authenticate.ts       # lê Bearer token, coloca req.user
        authorize.ts          # exige role, ex.: authorize("ADMIN")
      cache/cache.ts          # get/set/del com TTL sobre o Redis
    modules/
      health/
        health.routes.ts
        health.controller.ts
      users/
        users.repository.ts   # acesso ao Prisma para User
        users.types.ts
      auth/
        auth.routes.ts
        auth.controller.ts
        auth.service.ts
        auth.schemas.ts
        token.service.ts
        auth.service.test.ts
        token.service.test.ts
  tests/
    e2e/
      setup.ts                # limpa tabelas e Redis antes de cada arquivo
      health.e2e.test.ts
      auth.e2e.test.ts
```

### Padrão de um módulo

Cada módulo é uma pasta em `src/modules/<nome>` contendo:

- `<nome>.routes.ts`: `Router` do Express. Só mapeia rota → middlewares → controller.
- `<nome>.controller.ts`: lê `req`, chama o service, escreve `res`. Sem regra de negócio.
- `<nome>.service.ts`: regras de negócio. Recebe dependências pelo construtor.
- `<nome>.repository.ts`: acesso ao Prisma. Único lugar que conhece o banco.
- `<nome>.schemas.ts`: schemas zod de entrada e tipos derivados.
- `<nome>.service.test.ts`: teste unitário, mocka repository e outras dependências.

Módulos pequenos podem omitir arquivos que não precisam (ex.: `health` não tem service nem repository).

## 5. Convenções HTTP

- Prefixo: `/api/v1`
- Swagger UI: `/docs`
- Health: `GET /health` (fora do prefixo), responde `{ status: "ok", postgres: "ok", redis: "ok" }` ou 503 se algum falhar.
- Erros sempre no formato:

```json
{ "error": { "code": "NOT_FOUND", "message": "Usuário não encontrado" } }
```

Códigos usados na fundação: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500). Erros de validação incluem `details` com a lista de campos inválidos do zod.

## 6. Dados

```prisma
enum Role { ADMIN TOURIST }

model User {
  id           String   @id @default(uuid())
  name         String
  email        String   @unique
  passwordHash String
  role         Role     @default(TOURIST)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

Níveis de acesso:

- **Convidado**: sem token. Acessa tudo que for leitura de conteúdo nos módulos futuros.
- **TOURIST**: criado pela rota pública de registro. Na fundação, acessa o mesmo que o convidado mais `/auth/me` e `/auth/logout`.
- **ADMIN**: sem rota pública de criação. O primeiro admin nasce do `prisma/seed.ts`, lendo `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` do `.env`. O seed é idempotente: se o email já existir, não faz nada.

### Redis

- Refresh tokens: chave `refresh:<jti>`, valor `userId`, TTL igual à validade do refresh token. Apagar a chave revoga a sessão.
- Cache de conteúdo: chave `cache:<recurso>:<params>`, valor JSON, TTL curto (padrão 60 s). Na fundação existe apenas o helper `cache.ts` com `get`, `set` e `del`, mais seu teste unitário. O uso real entra nos módulos de conteúdo.

## 7. Módulo de auth

Rotas sob `/api/v1/auth`:

| Método | Rota | Acesso | Comportamento |
|---|---|---|---|
| POST | `/register` | público | Cria usuário `TOURIST`. Email duplicado → 409. Devolve `{ user, accessToken, refreshToken }` |
| POST | `/login` | público | Valida email e senha. Falha → 401 com a mesma mensagem, sem dizer qual campo errou |
| POST | `/refresh` | público | Recebe `{ refreshToken }`. Verifica assinatura, confere `jti` no Redis, apaga o antigo, emite par novo. Token inválido, expirado ou já usado → 401 |
| POST | `/logout` | autenticado | Recebe `{ refreshToken }`, apaga a chave no Redis. Responde 204 |
| GET | `/me` | autenticado | Devolve `{ id, name, email, role }` |

Validação de entrada (zod):

- `register`: `name` (2 a 80 chars), `email` (formato válido), `password` (mínimo 8 chars)
- `login`: `email`, `password`
- `refresh` e `logout`: `refreshToken` (string não vazia)

### Tokens

- **Access token**: JWT HS256 com `JWT_ACCESS_SECRET`, validade 15 min. Payload: `sub` (userId), `role`. Não é armazenado.
- **Refresh token**: JWT HS256 com `JWT_REFRESH_SECRET`, validade 7 dias. Payload: `sub`, `jti` (UUID aleatório). O `jti` é a chave no Redis.
- Refresh rotaciona: cada uso apaga o `jti` antigo e emite um novo. Um token vazado só funciona uma vez.

Senhas com bcryptjs, custo 10. O objeto `user` retornado nunca inclui `passwordHash`.

### Fluxo interno

```
auth.routes  →  validate(schema)  →  auth.controller  →  AuthService
                                                              ├─ UsersRepository (Prisma)
                                                              ├─ TokenService (jsonwebtoken)
                                                              └─ Redis client
```

`AuthService` recebe as três dependências pelo construtor. `TokenService` encapsula `signAccess`, `signRefresh`, `verifyAccess`, `verifyRefresh`.

### Middlewares de auth

- `authenticate`: lê `Authorization: Bearer <token>`, verifica com `TokenService.verifyAccess`, coloca `req.user = { id, role }`. Sem token ou token inválido → 401.
- `authorize(...roles)`: exige `req.user.role` em `roles`. Caso contrário → 403. Sempre usado depois de `authenticate`.
- Rotas de leitura de conteúdo (módulos futuros) não usam nenhum dos dois, o que implementa o acesso de convidado.

## 8. Configuração e Docker

### Variáveis de ambiente (`.env.example`)

```
NODE_ENV=development
PORT=3333
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/estacao
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=troque-me
JWT_REFRESH_SECRET=troque-me-tambem
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
ADMIN_NAME=Admin
ADMIN_EMAIL=admin@estacao.local
ADMIN_PASSWORD=troque-me
```

`src/config/env.ts` valida tudo com zod na inicialização e falha rápido se faltar algo. Os hosts são `localhost` para comandos rodados na máquina; dentro do Compose, o serviço `api` sobrescreve `DATABASE_URL` e `REDIS_URL` com os nomes dos serviços.

### Docker Compose

Perfil padrão:

- `api`: build do `Dockerfile`, volume de `src` para hot reload com `tsx watch`, roda `prisma migrate deploy` antes de subir. Porta 3333.
- `postgres`: imagem `postgres:16-alpine`, volume nomeado, porta 5432.
- `redis`: imagem `redis:7-alpine`, volume nomeado, porta 6379.

Perfil `test`:

- `postgres-test`: porta 5433, sem volume.
- `redis-test`: porta 6380, sem volume.

`Dockerfile` multi-stage: estágio de build compila TS e gera o Prisma Client; estágio final copia `dist/`, `node_modules` de produção e `prisma/` e roda `node dist/server.js`.

### Scripts npm

```
dev             tsx watch src/server.ts
build           prisma generate && tsc
start           node dist/server.js
test            jest --selectProjects unit
test:e2e        docker compose --profile test up -d && prisma migrate deploy (com DATABASE_URL de teste) && jest --selectProjects e2e ; docker compose --profile test down
prisma:migrate  prisma migrate dev
prisma:seed     tsx prisma/seed.ts
prisma:studio   prisma studio
```

O Jest usa dois projetos na mesma config: `unit` (arquivos `*.test.ts` em `src`) e `e2e` (arquivos `*.e2e.test.ts` em `tests/e2e`). O projeto `e2e` carrega `.env.test` com as URLs de teste.

## 9. Testes

### Unitários

Ficam ao lado do código, sufixo `.test.ts`. Mockam dependências com `jest.fn()`. Não tocam banco nem Redis.

Cobrem:

- `AuthService`: register (sucesso e email duplicado), login (sucesso, email inexistente, senha errada), refresh (sucesso com rotação, jti ausente no Redis, token inválido), logout.
- `TokenService`: sign e verify de access e refresh, rejeição de token com segredo errado e expirado.
- `cache`: get/set/del e serialização JSON.
- `errorHandler`: mapeia AppError, ZodError e erro desconhecido para o formato padrão.
- `validate`: passa dados válidos e rejeita inválidos com 400.

### E2E

Em `tests/e2e`, sufixo `.e2e.test.ts`, com supertest contra o `app` real e a infra do perfil `test`. `setup.ts` roda `beforeAll` por arquivo: trunca as tabelas e executa `FLUSHDB` no Redis.

Cobrem:

- `health`: 200 com infra no ar.
- `auth`: register → login → `/me` → refresh (o refresh antigo passa a falhar) → logout (o refresh apagado falha) → `/me` sem token dá 401 → register com email duplicado dá 409 → login errado dá 401.

## 10. Documentação

- `docs/openapi.yaml` escrito à mão, com todos os paths, schemas de request/response, o schema de erro padrão e o security scheme `bearerAuth`. Cada módulo novo adiciona seus paths e schemas ao mesmo arquivo.
- `README.md` cobre: o que é o projeto, stack, pré-requisitos, como rodar com Docker, variáveis de ambiente, estrutura de pastas, o padrão de módulo e como criar um novo, como rodar cada tipo de teste, como acessar o Swagger, e o roteiro de módulos.

## 11. Integração com o app

Mudanças no repositório do app (`Estacao-Pedro-II`), feitas na branch `joao/changes` criada a partir de `master`. São as mínimas para começar a usar o servidor:

- `src/services/api.ts`: cliente sobre `fetch` com base em `EXPO_PUBLIC_API_URL`. Anexa `Authorization: Bearer` quando houver access token. Ao receber 401 em uma rota autenticada, tenta um refresh uma única vez e repete a requisição; se o refresh falhar, limpa a sessão.
- Tokens guardados com `expo-secure-store`. Flag de "convidado" também.
- `src/contexts/AuthContext.tsx`: expõe `user`, `isGuest`, `isLoading`, `signIn`, `signUp`, `signOut`, `continueAsGuest`. Na inicialização, lê o storage: se há refresh token, tenta renovar e carrega `/me`; se há flag de convidado, entra como convidado; senão, mostra a tela de boas-vindas.
- Nova tela `Welcome` antes da `Home`, com três ações: entrar, criar conta, continuar como convidado. Telas `SignIn` e `SignUp` simples, com os campos do backend. Seguem o tema e os componentes existentes.
- `Home` e telas de detalhe continuam com dados estáticos. Cada módulo de conteúdo, ao entrar, troca a fonte pela chamada ao servidor.

Correções no app aproveitando a integração:

- Renomear a pasta `src/Data` para `src/data`, casando com os imports `@/data/...` e evitando quebra em sistemas case-sensitive.
- Corrigir os pesos de fonte trocados no tema de navegação em `AppRoutes.tsx` (regular com 400, bold com 700).

## 12. Fora do escopo desta fundação

- Qualquer módulo de conteúdo e upload de imagens.
- Favoritos, salvos ou qualquer funcionalidade exclusiva do turista.
- Recuperação de senha, verificação de email, login social.
- Rate limiting, CORS restritivo, logging estruturado, métricas.
- Deploy em nuvem e CI.

## 13. Roteiro de módulos

Um spec por módulo, nesta ordem:

1. Fundação (este spec)
2. Cachoeiras, incluindo upload de imagem e cache, que servem de modelo para os demais
3. Pontos turísticos
4. Eventos
5. Guias, com WhatsApp e Instagram reais
6. Hospedagem e restaurantes
7. Favoritos e salvos do turista
