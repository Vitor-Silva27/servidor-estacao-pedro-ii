# Fundação do backend — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o servidor `servidor-estacao-pedro-ii` (Express + Prisma + Redis, Docker, Jest, Swagger) com autenticação JWT + refresh token e três níveis de acesso, e fazer o app Expo começar a usá-lo com telas de login, cadastro e modo convidado.

**Architecture:** Módulo = pasta em `src/modules/<nome>` com routes, controller, service, repository e schemas. Dependências passadas pelo construtor, sem container de DI. `src/app.ts` é o único ponto de composição. Refresh tokens vivem no Redis com TTL; cache de conteúdo tem só o helper. O app ganha um cliente HTTP com refresh automático, um `AuthContext` e três telas novas antes da Home.

**Tech Stack:** Node 22, TypeScript 5.9, Express 5, Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`), ioredis 5, zod 4, jsonwebtoken 9, bcryptjs 3, swagger-ui-express 5, Jest 29 + ts-jest + supertest, tsx, Docker Compose. App: Expo SDK 54, expo-secure-store 15.

**Spec:** `docs/superpowers/specs/2026-09-06-fundacao-backend-design.md`

---

## Convenções para quem executa

- Diretório do servidor: `C:\Users\vitpe\projetos\servidor-estacao-pedro-ii` (repo já iniciado, branch `main`).
- Diretório do app: `C:\Users\vitpe\projetos\Estacao-Pedro-II`. Todo trabalho no app acontece na branch `joao/changes`, criada a partir de `master` na Task 17.
- Todo commit termina com as duas linhas abaixo (o executor adiciona, os passos mostram só a primeira linha da mensagem):
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019wXNXudFqQ9FRtrNjFk5oU
  ```
- Comandos são para PowerShell no Windows, salvo quando dito o contrário. `npx` funciona igual.
- Antes de qualquer `npm test` ou `npx tsc`, o Prisma Client precisa ter sido gerado (`npx prisma generate`, Task 3). Ele fica em `src/generated/prisma`, que é ignorado pelo git.

## Mapa de arquivos

### Servidor

| Arquivo | Responsabilidade |
|---|---|
| `package.json`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.js` | Toolchain |
| `.env.example`, `.env.test`, `.gitignore`, `.dockerignore` | Config e ignores |
| `Dockerfile`, `docker-compose.yml` | Infra |
| `prisma.config.ts`, `prisma/schema.prisma`, `prisma/seed.ts` | Banco |
| `src/config/env.ts` | Lê e valida env com zod |
| `src/lib/prisma.ts`, `src/lib/redis.ts` | Clientes singleton |
| `src/types/express.d.ts` | Adiciona `req.user` ao tipo do Express |
| `src/shared/errors/AppError.ts` | Erros HTTP tipados |
| `src/shared/middlewares/errorHandler.ts` | Erro → JSON padronizado |
| `src/shared/middlewares/validate.ts` | Valida body/params com zod |
| `src/shared/middlewares/authenticate.ts` | Bearer → `req.user` |
| `src/shared/middlewares/authorize.ts` | Exige role |
| `src/shared/cache/cache.ts` | get/set/del JSON com TTL no Redis |
| `src/modules/health/health.routes.ts`, `health.controller.ts` | `GET /health` |
| `src/modules/users/users.types.ts`, `users.repository.ts` | Tipos e acesso a `User` |
| `src/modules/auth/token.service.ts` | Sign/verify dos JWTs |
| `src/modules/auth/auth.schemas.ts` | Schemas zod de entrada |
| `src/modules/auth/auth.service.ts` | Regras de register/login/refresh/logout/me |
| `src/modules/auth/auth.controller.ts` | Handlers Express |
| `src/modules/auth/auth.routes.ts` | Router de `/api/v1/auth` |
| `src/app.ts`, `src/server.ts` | Composição e boot |
| `docs/openapi.yaml` | Swagger |
| `tests/e2e/setup.ts`, `health.e2e.test.ts`, `auth.e2e.test.ts` | E2E |
| `README.md` | Documentação |

### App (branch `joao/changes`)

| Arquivo | Responsabilidade |
|---|---|
| `src/data/*` (renomeado de `src/Data`) | Casar com imports `@/data` |
| `src/AppRoutes.tsx` | Corrige fontes; stack de auth vs stack do app |
| `src/App.tsx` | Envolve com `AuthProvider` |
| `.env.example`, `.gitignore` | `EXPO_PUBLIC_API_URL` |
| `src/services/session.ts` | Tokens e flag de convidado no SecureStore |
| `src/services/api.ts` | `fetch` com Bearer e refresh automático |
| `src/services/authApi.ts` | Chamadas de auth tipadas |
| `src/contexts/AuthContext.tsx` | Estado de sessão |
| `src/shared/Components/Button`, `Input` | Componentes de formulário |
| `src/pages/Welcome`, `SignIn`, `SignUp` | Telas novas |

---

## Task 1: Scaffold do projeto e toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.js`, `.gitignore`, `.env.example`, `.env.test`

- [ ] **Step 1: Inicializar o package.json e instalar dependências**

No diretório `servidor-estacao-pedro-ii`:

```powershell
npm init -y
npm pkg set name="servidor-estacao-pedro-ii" version="0.1.0" private=true description="API do app Estação Pedro II" main="dist/server.js" engines.node=">=22"
npm install express@5 @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 pg@8 ioredis@5 zod@4 jsonwebtoken@9 bcryptjs@3 swagger-ui-express@5 yaml@2 dotenv@17
npm install -D typescript@~5.9.0 prisma@7.10.0 tsx@4 jest@29 ts-jest@29 @types/jest@29 supertest@7 @types/supertest@6 @types/express@5 @types/jsonwebtoken@9 @types/swagger-ui-express@4 @types/node@22 @types/pg@8 dotenv-cli@10
```

- [ ] **Step 2: Definir os scripts npm**

```powershell
npm pkg set scripts.dev="tsx watch src/server.ts" scripts.build="prisma generate && tsc -p tsconfig.build.json" scripts.start="node dist/server.js" scripts.typecheck="tsc --noEmit" scripts.test="jest --selectProjects unit" scripts.test:e2e="npm run test:e2e:up && npm run test:e2e:run && npm run test:e2e:down" scripts.test:e2e:up="docker compose --profile test up -d --wait postgres-test redis-test" scripts.test:e2e:run="dotenv -e .env.test -- prisma migrate deploy && dotenv -e .env.test -- jest --selectProjects e2e --runInBand" scripts.test:e2e:down="docker compose --profile test rm -sf postgres-test redis-test" scripts.prisma:generate="prisma generate" scripts.prisma:migrate="prisma migrate dev" scripts.prisma:seed="prisma db seed" scripts.prisma:studio="prisma studio"
```

Depois remova o script `test` padrão duplicado se o `npm init` tiver criado um com `echo`. Confira com `Get-Content package.json`.

- [ ] **Step 3: Criar tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "types": ["node", "jest"]
  },
  "include": ["src", "prisma", "tests", "prisma.config.ts"]
}
```

- [ ] **Step 4: Criar tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 5: Criar jest.config.js**

```js
/** @type {import('jest').Config} */
const shared = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
};

module.exports = {
  projects: [
    {
      ...shared,
      displayName: "unit",
      testMatch: ["<rootDir>/src/**/*.test.ts"],
    },
    {
      ...shared,
      displayName: "e2e",
      testMatch: ["<rootDir>/tests/e2e/**/*.e2e.test.ts"],
      setupFilesAfterEnv: ["<rootDir>/tests/e2e/setup.ts"],
    },
  ],
};
```

- [ ] **Step 6: Criar .gitignore**

```
node_modules/
dist/
src/generated/
.env
*.log
```

- [ ] **Step 7: Criar .env.example**

Os hosts são `localhost` porque este arquivo serve para comandos rodados na máquina (Prisma CLI, testes). Dentro do Docker, o `docker-compose.yml` sobrescreve `DATABASE_URL` e `REDIS_URL` com os nomes dos serviços.

```
NODE_ENV=development
PORT=3333
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/estacao
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=troque-me-por-um-segredo-longo
JWT_REFRESH_SECRET=troque-me-por-outro-segredo-longo
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
ADMIN_NAME=Admin
ADMIN_EMAIL=admin@estacao.local
ADMIN_PASSWORD=troque-me-12345
```

- [ ] **Step 8: Criar .env.test (este é commitado, só tem valores de teste)**

```
NODE_ENV=test
PORT=3334
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/estacao_test
REDIS_URL=redis://localhost:6380
JWT_ACCESS_SECRET=access-secret-de-teste
JWT_REFRESH_SECRET=refresh-secret-de-teste
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
ADMIN_NAME=Admin
ADMIN_EMAIL=admin@estacao.local
ADMIN_PASSWORD=admin-de-teste-123
```

- [ ] **Step 9: Copiar .env.example para .env**

```powershell
Copy-Item .env.example .env
```

- [ ] **Step 10: Commit**

```powershell
git add package.json package-lock.json tsconfig.json tsconfig.build.json jest.config.js .gitignore .env.example .env.test
git commit -m "chore: scaffold do projeto com toolchain"
```

---

## Task 2: Docker Compose e Dockerfile

**Files:**
- Create: `docker-compose.yml`, `Dockerfile`, `.dockerignore`

- [ ] **Step 1: Criar docker-compose.yml**

```yaml
services:
  api:
    build:
      context: .
      target: dev
    command: sh -c "npx prisma generate && npx prisma migrate deploy && npm run dev"
    ports:
      - "3333:3333"
    env_file: .env
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/estacao
      REDIS_URL: redis://redis:6379
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: estacao
    ports:
      - "5434:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  postgres-test:
    image: postgres:16-alpine
    profiles: ["test"]
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: estacao_test
    ports:
      - "5433:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis-test:
    image: redis:7-alpine
    profiles: ["test"]
    ports:
      - "6380:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  postgres-data:
  redis-data:
```

- [ ] **Step 2: Criar Dockerfile**

```dockerfile
FROM node:22-bookworm-slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

FROM base AS dev
CMD ["npm", "run", "dev"]

FROM base AS build
# prisma.config.ts exige DATABASE_URL mesmo para gerar o client; o valor não é usado no build
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build

FROM node:22-bookworm-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/docs/openapi.yaml ./docs/openapi.yaml
EXPOSE 3333
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
```

- [ ] **Step 3: Criar .dockerignore**

```
node_modules
dist
src/generated
.git
.env
.env.test
docs/superpowers
```

- [ ] **Step 4: Subir Postgres e Redis de desenvolvimento**

```powershell
docker compose up -d --wait postgres redis
docker compose ps
```

Expected: `postgres` e `redis` com status `healthy`.

- [ ] **Step 5: Commit**

```powershell
git add docker-compose.yml Dockerfile .dockerignore
git commit -m "chore: docker compose com postgres, redis e perfil de teste"
```

---

## Task 3: Prisma, schema de User e cliente

**Files:**
- Create: `prisma.config.ts`, `prisma/schema.prisma`, `src/config/env.ts`, `src/lib/prisma.ts`, `src/lib/redis.ts`

- [ ] **Step 1: Criar prisma.config.ts**

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

- [ ] **Step 2: Criar prisma/schema.prisma**

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  runtime      = "nodejs"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}

enum Role {
  ADMIN
  TOURIST
}

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

- [ ] **Step 3: Gerar o cliente e criar a migration inicial**

```powershell
npx prisma generate
npx prisma migrate dev --name init
```

Expected: pasta `src/generated/prisma` criada; `prisma/migrations/<timestamp>_init/migration.sql` criado; saída termina com "Your database is now in sync with your schema".

- [ ] **Step 4: Criar src/config/env.ts**

```ts
import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("7d"),
  ADMIN_NAME: z.string().min(1),
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD: z.string().min(8),
});

export const env = schema.parse(process.env);
```

- [ ] **Step 5: Criar src/lib/prisma.ts**

```ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { env } from "../config/env";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
```

- [ ] **Step 6: Criar src/lib/redis.ts**

```ts
import Redis from "ioredis";
import { env } from "../config/env";

export const redis = new Redis(env.REDIS_URL);
```

- [ ] **Step 7: Conferir que compila**

```powershell
npx tsc --noEmit
```

Expected: sem saída (zero erros).

- [ ] **Step 8: Commit**

```powershell
git add prisma.config.ts prisma src/config src/lib
git commit -m "feat: prisma com modelo User, env validado e clientes de banco"
```

---

## Task 4: Erros tipados e errorHandler

**Files:**
- Create: `src/shared/errors/AppError.ts`, `src/shared/middlewares/errorHandler.ts`
- Test: `src/shared/middlewares/errorHandler.test.ts`

- [ ] **Step 1: Criar src/shared/errors/AppError.ts**

```ts
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Não autorizado") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acesso negado") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso não encontrado") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflito") {
    super(409, "CONFLICT", message);
  }
}
```

- [ ] **Step 2: Escrever o teste do errorHandler**

`src/shared/middlewares/errorHandler.test.ts`:

```ts
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { errorHandler } from "./errorHandler";
import { NotFoundError } from "../errors/AppError";

function mockRes() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const req = {} as Request;
const next = jest.fn() as NextFunction;

describe("errorHandler", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it("mapeia AppError para o status e código dele", () => {
    const res = mockRes();
    errorHandler(new NotFoundError("Usuário não encontrado"), req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "NOT_FOUND", message: "Usuário não encontrado" },
    });
  });

  it("mapeia ZodError para 400 com details", () => {
    const res = mockRes();
    const result = z.object({ email: z.email() }).safeParse({ email: "x" });
    if (result.success) throw new Error("esperava falha");
    errorHandler(result.error, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados inválidos",
        details: [{ path: "email", message: expect.any(String) }],
      },
    });
  });

  it("mapeia erro desconhecido para 500 sem vazar a mensagem", () => {
    const res = mockRes();
    errorHandler(new Error("segredo"), req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" },
    });
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

```powershell
npm test -- errorHandler
```

Expected: FAIL, "Cannot find module './errorHandler'".

- [ ] **Step 4: Criar src/shared/middlewares/errorHandler.ts**

```ts
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados inválidos",
        details: err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" },
  });
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

```powershell
npm test -- errorHandler
```

Expected: PASS, 3 testes.

- [ ] **Step 6: Commit**

```powershell
git add src/shared/errors src/shared/middlewares/errorHandler.ts src/shared/middlewares/errorHandler.test.ts
git commit -m "feat: erros tipados e errorHandler com resposta padronizada"
```

---

## Task 5: Middleware validate

**Files:**
- Create: `src/shared/middlewares/validate.ts`
- Test: `src/shared/middlewares/validate.test.ts`

- [ ] **Step 1: Escrever o teste**

`src/shared/middlewares/validate.test.ts`:

```ts
import type { Request, Response } from "express";
import { z, ZodError } from "zod";
import { validate } from "./validate";

const res = {} as Response;

describe("validate", () => {
  const schema = z.object({ email: z.email(), age: z.coerce.number() });

  it("substitui req.body pelos dados parseados e chama next", () => {
    const req = { body: { email: "a@b.com", age: "30", extra: 1 } } as Request;
    const next = jest.fn();
    validate({ body: schema })(req, res, next);
    expect(req.body).toEqual({ email: "a@b.com", age: 30 });
    expect(next).toHaveBeenCalledWith();
  });

  it("lança ZodError quando o body é inválido", () => {
    const req = { body: { email: "x" } } as Request;
    const next = jest.fn();
    expect(() => validate({ body: schema })(req, res, next)).toThrow(ZodError);
    expect(next).not.toHaveBeenCalled();
  });

  it("valida params quando informado", () => {
    const req = { params: { id: "abc" } } as unknown as Request;
    const next = jest.fn();
    validate({ params: z.object({ id: z.string().min(1) }) })(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npm test -- validate
```

Expected: FAIL, "Cannot find module './validate'".

- [ ] **Step 3: Criar src/shared/middlewares/validate.ts**

```ts
import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type Schemas = {
  body?: ZodType;
  params?: ZodType;
};

export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    if (schemas.body) req.body = schemas.body.parse(req.body);
    if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
    next();
  };
}
```

Um `ZodError` lançado aqui cai no `errorHandler`, que responde 400. No Express 5, erros lançados de forma síncrona ou em promises rejeitadas vão sozinhos para o error handler.

- [ ] **Step 4: Rodar e ver passar**

```powershell
npm test -- validate
```

Expected: PASS, 3 testes.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/middlewares/validate.ts src/shared/middlewares/validate.test.ts
git commit -m "feat: middleware validate com zod"
```

---

## Task 6: Helper de cache

**Files:**
- Create: `src/shared/cache/cache.ts`
- Test: `src/shared/cache/cache.test.ts`

- [ ] **Step 1: Escrever o teste**

`src/shared/cache/cache.test.ts`:

```ts
import { createCache, type CacheStore } from "./cache";

function mockStore() {
  return {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  } as unknown as jest.Mocked<CacheStore>;
}

describe("cache", () => {
  it("set serializa em JSON com prefixo e TTL padrão", async () => {
    const store = mockStore();
    const cache = createCache(store);
    await cache.set("waterfalls:all", [{ id: 1 }]);
    expect(store.set).toHaveBeenCalledWith("cache:waterfalls:all", '[{"id":1}]', "EX", 60);
  });

  it("set aceita TTL customizado", async () => {
    const store = mockStore();
    const cache = createCache(store, 60);
    await cache.set("k", "v", 5);
    expect(store.set).toHaveBeenCalledWith("cache:k", '"v"', "EX", 5);
  });

  it("get desserializa o valor", async () => {
    const store = mockStore();
    store.get.mockResolvedValue('{"a":1}');
    const cache = createCache(store);
    await expect(cache.get<{ a: number }>("k")).resolves.toEqual({ a: 1 });
    expect(store.get).toHaveBeenCalledWith("cache:k");
  });

  it("get devolve null quando não há valor", async () => {
    const store = mockStore();
    store.get.mockResolvedValue(null);
    const cache = createCache(store);
    await expect(cache.get("k")).resolves.toBeNull();
  });

  it("del remove a chave com prefixo", async () => {
    const store = mockStore();
    const cache = createCache(store);
    await cache.del("k");
    expect(store.del).toHaveBeenCalledWith("cache:k");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npm test -- cache
```

Expected: FAIL, "Cannot find module './cache'".

- [ ] **Step 3: Criar src/shared/cache/cache.ts**

```ts
import type Redis from "ioredis";

export type CacheStore = Pick<Redis, "get" | "set" | "del">;

const PREFIX = "cache:";

export function createCache(store: CacheStore, defaultTtlSeconds = 60) {
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await store.get(PREFIX + key);
      return raw === null ? null : (JSON.parse(raw) as T);
    },

    async set(key: string, value: unknown, ttlSeconds = defaultTtlSeconds): Promise<void> {
      await store.set(PREFIX + key, JSON.stringify(value), "EX", ttlSeconds);
    },

    async del(key: string): Promise<void> {
      await store.del(PREFIX + key);
    },
  };
}

export type Cache = ReturnType<typeof createCache>;
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
npm test -- cache
```

Expected: PASS, 5 testes.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/cache
git commit -m "feat: helper de cache sobre o Redis"
```

---

## Task 7: Tipos de usuário e repository

**Files:**
- Create: `src/modules/users/users.types.ts`, `src/modules/users/users.repository.ts`, `src/types/express.d.ts`

- [ ] **Step 1: Criar src/modules/users/users.types.ts**

```ts
import type { User } from "../../generated/prisma/client";

export type Role = "ADMIN" | "TOURIST";

export type UserRecord = User;

export type PublicUser = Pick<User, "id" | "name" | "email" | "role">;

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
```

- [ ] **Step 2: Criar src/modules/users/users.repository.ts**

```ts
import type { PrismaClient } from "../../generated/prisma/client";
import type { UserRecord } from "./users.types";

export type CreateUserData = {
  name: string;
  email: string;
  passwordHash: string;
};

export class UsersRepository {
  constructor(private readonly db: PrismaClient) {}

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  create(data: CreateUserData): Promise<UserRecord> {
    return this.db.user.create({ data });
  }
}
```

- [ ] **Step 3: Criar src/types/express.d.ts**

```ts
import type { Role } from "../modules/users/users.types";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

export {};
```

- [ ] **Step 4: Conferir que compila**

```powershell
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 5: Commit**

```powershell
git add src/modules/users src/types
git commit -m "feat: tipos de usuário, UsersRepository e req.user"
```

---

## Task 8: TokenService

**Files:**
- Create: `src/modules/auth/token.service.ts`
- Test: `src/modules/auth/token.service.test.ts`

- [ ] **Step 1: Escrever o teste**

`src/modules/auth/token.service.test.ts`:

```ts
import { TokenService } from "./token.service";
import { UnauthorizedError } from "../../shared/errors/AppError";

const config = {
  accessSecret: "access-secret",
  refreshSecret: "refresh-secret",
  accessExpires: "15m",
  refreshExpires: "7d",
};

describe("TokenService", () => {
  const tokens = new TokenService(config);

  afterEach(() => jest.useRealTimers());

  it("assina e verifica um access token com sub e role", () => {
    const token = tokens.signAccess({ sub: "user-1", role: "ADMIN" });
    expect(tokens.verifyAccess(token)).toEqual({ sub: "user-1", role: "ADMIN" });
  });

  it("assina um refresh token com jti único e TTL em segundos", () => {
    const a = tokens.signRefresh("user-1");
    const b = tokens.signRefresh("user-1");
    expect(a.jti).not.toBe(b.jti);
    expect(a.ttlSeconds).toBeGreaterThan(7 * 24 * 60 * 60 - 5);
    expect(a.ttlSeconds).toBeLessThanOrEqual(7 * 24 * 60 * 60);
    expect(tokens.verifyRefresh(a.token)).toEqual({ sub: "user-1", jti: a.jti });
  });

  it("rejeita access token assinado com outro segredo", () => {
    const other = new TokenService({ ...config, accessSecret: "errado" });
    const token = other.signAccess({ sub: "user-1", role: "TOURIST" });
    expect(() => tokens.verifyAccess(token)).toThrow(UnauthorizedError);
  });

  it("não aceita refresh token no lugar de access token", () => {
    const { token } = tokens.signRefresh("user-1");
    expect(() => tokens.verifyAccess(token)).toThrow(UnauthorizedError);
  });

  it("rejeita access token expirado", () => {
    jest.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") });
    const token = tokens.signAccess({ sub: "user-1", role: "TOURIST" });
    jest.setSystemTime(new Date("2026-01-01T00:16:00Z"));
    expect(() => tokens.verifyAccess(token)).toThrow(UnauthorizedError);
  });

  it("rejeita lixo", () => {
    expect(() => tokens.verifyRefresh("nao-e-um-jwt")).toThrow(UnauthorizedError);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npm test -- token.service
```

Expected: FAIL, "Cannot find module './token.service'".

- [ ] **Step 3: Criar src/modules/auth/token.service.ts**

```ts
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../../shared/errors/AppError";
import type { Role } from "../users/users.types";

export type TokenConfig = {
  accessSecret: string;
  refreshSecret: string;
  accessExpires: string;
  refreshExpires: string;
};

export type AccessPayload = { sub: string; role: Role };
export type RefreshPayload = { sub: string; jti: string };

export type SignedRefresh = { token: string; jti: string; ttlSeconds: number };

type ExpiresIn = jwt.SignOptions["expiresIn"];

export class TokenService {
  constructor(private readonly config: TokenConfig) {}

  signAccess(payload: AccessPayload): string {
    return jwt.sign({ role: payload.role }, this.config.accessSecret, {
      subject: payload.sub,
      expiresIn: this.config.accessExpires as ExpiresIn,
    });
  }

  signRefresh(userId: string): SignedRefresh {
    const jti = randomUUID();
    const token = jwt.sign({}, this.config.refreshSecret, {
      subject: userId,
      jwtid: jti,
      expiresIn: this.config.refreshExpires as ExpiresIn,
    });
    const { exp } = jwt.decode(token) as { exp: number };
    const ttlSeconds = exp - Math.floor(Date.now() / 1000);
    return { token, jti, ttlSeconds };
  }

  verifyAccess(token: string): AccessPayload {
    const payload = this.verify(token, this.config.accessSecret);
    if (!payload.sub || typeof payload.role !== "string") {
      throw new UnauthorizedError("Token inválido");
    }
    return { sub: payload.sub, role: payload.role as Role };
  }

  verifyRefresh(token: string): RefreshPayload {
    const payload = this.verify(token, this.config.refreshSecret);
    if (!payload.sub || !payload.jti) {
      throw new UnauthorizedError("Token inválido");
    }
    return { sub: payload.sub, jti: payload.jti };
  }

  private verify(token: string, secret: string): jwt.JwtPayload {
    try {
      const payload = jwt.verify(token, secret);
      if (typeof payload === "string") throw new Error("payload inesperado");
      return payload;
    } catch {
      throw new UnauthorizedError("Token inválido ou expirado");
    }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
npm test -- token.service
```

Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```powershell
git add src/modules/auth/token.service.ts src/modules/auth/token.service.test.ts
git commit -m "feat: TokenService para access e refresh JWT"
```

---

## Task 9: Middlewares authenticate e authorize

**Files:**
- Create: `src/shared/middlewares/authenticate.ts`, `src/shared/middlewares/authorize.ts`
- Test: `src/shared/middlewares/auth.test.ts`

- [ ] **Step 1: Escrever o teste**

`src/shared/middlewares/auth.test.ts`:

```ts
import type { Request, Response } from "express";
import { authenticate } from "./authenticate";
import { authorize } from "./authorize";
import { TokenService } from "../../modules/auth/token.service";
import { ForbiddenError, UnauthorizedError } from "../errors/AppError";

const tokens = new TokenService({
  accessSecret: "a",
  refreshSecret: "r",
  accessExpires: "15m",
  refreshExpires: "7d",
});
const res = {} as Response;

describe("authenticate", () => {
  it("preenche req.user a partir do Bearer token", () => {
    const token = tokens.signAccess({ sub: "u1", role: "TOURIST" });
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const next = jest.fn();
    authenticate(tokens)(req, res, next);
    expect(req.user).toEqual({ id: "u1", role: "TOURIST" });
    expect(next).toHaveBeenCalledWith();
  });

  it("lança 401 sem header", () => {
    const req = { headers: {} } as Request;
    expect(() => authenticate(tokens)(req, res, jest.fn())).toThrow(UnauthorizedError);
  });

  it("lança 401 com token inválido", () => {
    const req = { headers: { authorization: "Bearer lixo" } } as Request;
    expect(() => authenticate(tokens)(req, res, jest.fn())).toThrow(UnauthorizedError);
  });
});

describe("authorize", () => {
  it("deixa passar quando a role está na lista", () => {
    const req = { user: { id: "u1", role: "ADMIN" } } as Request;
    const next = jest.fn();
    authorize("ADMIN")(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("lança 403 quando a role não está na lista", () => {
    const req = { user: { id: "u1", role: "TOURIST" } } as Request;
    expect(() => authorize("ADMIN")(req, res, jest.fn())).toThrow(ForbiddenError);
  });

  it("lança 401 quando não há req.user", () => {
    const req = {} as Request;
    expect(() => authorize("ADMIN")(req, res, jest.fn())).toThrow(UnauthorizedError);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npm test -- middlewares/auth
```

Expected: FAIL, "Cannot find module './authenticate'".

- [ ] **Step 3: Criar src/shared/middlewares/authenticate.ts**

```ts
import type { RequestHandler } from "express";
import type { TokenService } from "../../modules/auth/token.service";
import { UnauthorizedError } from "../errors/AppError";

const PREFIX = "Bearer ";

export function authenticate(tokens: TokenService): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith(PREFIX)) {
      throw new UnauthorizedError("Token não informado");
    }
    const payload = tokens.verifyAccess(header.slice(PREFIX.length));
    req.user = { id: payload.sub, role: payload.role };
    next();
  };
}
```

- [ ] **Step 4: Criar src/shared/middlewares/authorize.ts**

```ts
import type { RequestHandler } from "express";
import type { Role } from "../../modules/users/users.types";
import { ForbiddenError, UnauthorizedError } from "../errors/AppError";

export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) throw new ForbiddenError();
    next();
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

```powershell
npm test -- middlewares/auth
```

Expected: PASS, 6 testes.

- [ ] **Step 6: Commit**

```powershell
git add src/shared/middlewares/authenticate.ts src/shared/middlewares/authorize.ts src/shared/middlewares/auth.test.ts
git commit -m "feat: middlewares authenticate e authorize"
```

---

## Task 10: Schemas e AuthService

**Files:**
- Create: `src/modules/auth/auth.schemas.ts`, `src/modules/auth/auth.service.ts`
- Test: `src/modules/auth/auth.service.test.ts`

- [ ] **Step 1: Criar src/modules/auth/auth.schemas.ts**

```ts
import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().toLowerCase(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 2: Escrever o teste do AuthService**

`src/modules/auth/auth.service.test.ts`:

```ts
import bcrypt from "bcryptjs";
import { AuthService, type RefreshStore } from "./auth.service";
import { TokenService } from "./token.service";
import type { UsersRepository } from "../users/users.repository";
import type { UserRecord } from "../users/users.types";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../shared/errors/AppError";

const tokens = new TokenService({
  accessSecret: "a",
  refreshSecret: "r",
  accessExpires: "15m",
  refreshExpires: "7d",
});

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "u1",
    name: "Ana",
    email: "ana@ex.com",
    passwordHash: bcrypt.hashSync("senha1234", 10),
    role: "TOURIST",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setup() {
  const users = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<UsersRepository>;
  const store = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  } as unknown as jest.Mocked<RefreshStore>;
  const service = new AuthService(users, tokens, store);
  return { users, store, service };
}

describe("AuthService.register", () => {
  it("cria TOURIST com senha hasheada, salva refresh no store e devolve tokens", async () => {
    const { users, store, service } = setup();
    users.findByEmail.mockResolvedValue(null);
    users.create.mockImplementation(async (data) => makeUser({ ...data, id: "novo" }));

    const result = await service.register({ name: "Ana", email: "ana@ex.com", password: "senha1234" });

    const created = users.create.mock.calls[0][0];
    expect(created.passwordHash).not.toBe("senha1234");
    expect(bcrypt.compareSync("senha1234", created.passwordHash)).toBe(true);
    expect(result.user).toEqual({ id: "novo", name: "Ana", email: "ana@ex.com", role: "TOURIST" });
    expect(result).not.toHaveProperty("user.passwordHash");
    expect(tokens.verifyAccess(result.accessToken).sub).toBe("novo");
    const { jti } = tokens.verifyRefresh(result.refreshToken);
    expect(store.set).toHaveBeenCalledWith(`refresh:${jti}`, "novo", "EX", expect.any(Number));
  });

  it("lança 409 se o email já existe", async () => {
    const { users, service } = setup();
    users.findByEmail.mockResolvedValue(makeUser());
    await expect(
      service.register({ name: "Ana", email: "ana@ex.com", password: "senha1234" }),
    ).rejects.toThrow(ConflictError);
    expect(users.create).not.toHaveBeenCalled();
  });
});

describe("AuthService.login", () => {
  it("devolve tokens com credenciais corretas", async () => {
    const { users, service } = setup();
    users.findByEmail.mockResolvedValue(makeUser());
    const result = await service.login({ email: "ana@ex.com", password: "senha1234" });
    expect(result.user.id).toBe("u1");
    expect(result.accessToken).toEqual(expect.any(String));
  });

  it("lança 401 com email inexistente", async () => {
    const { users, service } = setup();
    users.findByEmail.mockResolvedValue(null);
    await expect(service.login({ email: "x@ex.com", password: "senha1234" })).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("lança 401 com senha errada", async () => {
    const { users, service } = setup();
    users.findByEmail.mockResolvedValue(makeUser());
    await expect(service.login({ email: "ana@ex.com", password: "errada123" })).rejects.toThrow(
      UnauthorizedError,
    );
  });
});

describe("AuthService.refresh", () => {
  it("rotaciona: apaga o jti antigo e emite par novo", async () => {
    const { users, store, service } = setup();
    users.findById.mockResolvedValue(makeUser());
    const old = tokens.signRefresh("u1");
    store.get.mockResolvedValue("u1");

    const result = await service.refresh(old.token);

    expect(store.get).toHaveBeenCalledWith(`refresh:${old.jti}`);
    expect(store.del).toHaveBeenCalledWith(`refresh:${old.jti}`);
    const fresh = tokens.verifyRefresh(result.refreshToken);
    expect(fresh.jti).not.toBe(old.jti);
    expect(store.set).toHaveBeenCalledWith(`refresh:${fresh.jti}`, "u1", "EX", expect.any(Number));
  });

  it("lança 401 se o jti não está no store (já usado ou revogado)", async () => {
    const { store, service } = setup();
    const old = tokens.signRefresh("u1");
    store.get.mockResolvedValue(null);
    await expect(service.refresh(old.token)).rejects.toThrow(UnauthorizedError);
    expect(store.del).not.toHaveBeenCalled();
  });

  it("lança 401 com token inválido", async () => {
    const { service } = setup();
    await expect(service.refresh("lixo")).rejects.toThrow(UnauthorizedError);
  });
});

describe("AuthService.logout", () => {
  it("apaga o jti do store", async () => {
    const { store, service } = setup();
    const { token, jti } = tokens.signRefresh("u1");
    await service.logout(token);
    expect(store.del).toHaveBeenCalledWith(`refresh:${jti}`);
  });

  it("ignora token inválido sem lançar", async () => {
    const { store, service } = setup();
    await expect(service.logout("lixo")).resolves.toBeUndefined();
    expect(store.del).not.toHaveBeenCalled();
  });
});

describe("AuthService.me", () => {
  it("devolve o usuário público", async () => {
    const { users, service } = setup();
    users.findById.mockResolvedValue(makeUser());
    await expect(service.me("u1")).resolves.toEqual({
      id: "u1",
      name: "Ana",
      email: "ana@ex.com",
      role: "TOURIST",
    });
  });

  it("lança 404 se não existe", async () => {
    const { users, service } = setup();
    users.findById.mockResolvedValue(null);
    await expect(service.me("x")).rejects.toThrow(NotFoundError);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```powershell
npm test -- auth.service
```

Expected: FAIL, "Cannot find module './auth.service'".

- [ ] **Step 4: Criar src/modules/auth/auth.service.ts**

```ts
import bcrypt from "bcryptjs";
import type Redis from "ioredis";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../shared/errors/AppError";
import type { UsersRepository } from "../users/users.repository";
import { toPublicUser, type PublicUser, type UserRecord } from "../users/users.types";
import type { LoginInput, RegisterInput } from "./auth.schemas";
import type { TokenService } from "./token.service";

export type RefreshStore = Pick<Redis, "get" | "set" | "del">;

export type AuthResult = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

const BCRYPT_COST = 10;

function refreshKey(jti: string) {
  return `refresh:${jti}`;
}

export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly tokens: TokenService,
    private readonly store: RefreshStore,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) throw new ConflictError("Email já cadastrado");

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const user = await this.users.create({ name: input.name, email: input.email, passwordHash });
    return this.issueTokens(user);
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!user || !valid) throw new UnauthorizedError("Email ou senha inválidos");
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const { sub, jti } = this.tokens.verifyRefresh(refreshToken);
    const key = refreshKey(jti);

    const owner = await this.store.get(key);
    if (owner !== sub) throw new UnauthorizedError("Sessão inválida");
    await this.store.del(key);

    const user = await this.users.findById(sub);
    if (!user) throw new UnauthorizedError("Sessão inválida");
    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    let jti: string;
    try {
      jti = this.tokens.verifyRefresh(refreshToken).jti;
    } catch {
      return;
    }
    await this.store.del(refreshKey(jti));
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError("Usuário não encontrado");
    return toPublicUser(user);
  }

  private async issueTokens(user: UserRecord): Promise<AuthResult> {
    const accessToken = this.tokens.signAccess({ sub: user.id, role: user.role });
    const refresh = this.tokens.signRefresh(user.id);
    await this.store.set(refreshKey(refresh.jti), user.id, "EX", refresh.ttlSeconds);
    return { user: toPublicUser(user), accessToken, refreshToken: refresh.token };
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

```powershell
npm test -- auth.service
```

Expected: PASS, 12 testes.

- [ ] **Step 6: Commit**

```powershell
git add src/modules/auth/auth.schemas.ts src/modules/auth/auth.service.ts src/modules/auth/auth.service.test.ts
git commit -m "feat: AuthService com register, login, refresh rotativo, logout e me"
```

---

## Task 11: Controller, rotas de auth, health e app

**Files:**
- Create: `src/modules/auth/auth.controller.ts`, `src/modules/auth/auth.routes.ts`, `src/modules/health/health.controller.ts`, `src/modules/health/health.routes.ts`, `src/app.ts`, `src/server.ts`, `docs/openapi.yaml`

- [ ] **Step 1: Criar src/modules/auth/auth.controller.ts**

```ts
import type { RequestHandler } from "express";
import type { AuthService } from "./auth.service";

export function createAuthController(service: AuthService) {
  const register: RequestHandler = async (req, res) => {
    res.status(201).json(await service.register(req.body));
  };

  const login: RequestHandler = async (req, res) => {
    res.json(await service.login(req.body));
  };

  const refresh: RequestHandler = async (req, res) => {
    res.json(await service.refresh(req.body.refreshToken));
  };

  const logout: RequestHandler = async (req, res) => {
    await service.logout(req.body.refreshToken);
    res.status(204).send();
  };

  const me: RequestHandler = async (req, res) => {
    res.json(await service.me(req.user!.id));
  };

  return { register, login, refresh, logout, me };
}
```

- [ ] **Step 2: Criar src/modules/auth/auth.routes.ts**

```ts
import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate";
import { validate } from "../../shared/middlewares/validate";
import { createAuthController } from "./auth.controller";
import { loginSchema, refreshSchema, registerSchema } from "./auth.schemas";
import type { AuthService } from "./auth.service";
import type { TokenService } from "./token.service";

export function createAuthRouter(service: AuthService, tokens: TokenService) {
  const router = Router();
  const controller = createAuthController(service);
  const auth = authenticate(tokens);

  router.post("/register", validate({ body: registerSchema }), controller.register);
  router.post("/login", validate({ body: loginSchema }), controller.login);
  router.post("/refresh", validate({ body: refreshSchema }), controller.refresh);
  router.post("/logout", auth, validate({ body: refreshSchema }), controller.logout);
  router.get("/me", auth, controller.me);

  return router;
}
```

- [ ] **Step 3: Criar src/modules/health/health.controller.ts**

```ts
import type { RequestHandler } from "express";
import type Redis from "ioredis";
import type { PrismaClient } from "../../generated/prisma/client";

type Deps = { prisma: PrismaClient; redis: Redis };

type Status = "ok" | "error";

async function check(fn: () => Promise<unknown>): Promise<Status> {
  try {
    await fn();
    return "ok";
  } catch {
    return "error";
  }
}

export function createHealthController({ prisma, redis }: Deps): RequestHandler {
  return async (_req, res) => {
    const [postgres, redisStatus] = await Promise.all([
      check(() => prisma.$queryRaw`SELECT 1`),
      check(() => redis.ping()),
    ]);
    const healthy = postgres === "ok" && redisStatus === "ok";
    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      postgres,
      redis: redisStatus,
    });
  };
}
```

- [ ] **Step 4: Criar src/modules/health/health.routes.ts**

```ts
import { Router } from "express";
import { createHealthController } from "./health.controller";

export function createHealthRouter(deps: Parameters<typeof createHealthController>[0]) {
  const router = Router();
  router.get("/", createHealthController(deps));
  return router;
}
```

- [ ] **Step 5: Criar docs/openapi.yaml**

```yaml
openapi: 3.0.3
info:
  title: Estação Pedro II API
  version: 0.1.0
  description: |
    API do app de turismo Estação Pedro II (Pedro II, Piauí).

    Níveis de acesso:
    - **Convidado**: sem token. Lê o conteúdo público.
    - **TOURIST**: usuário cadastrado pelo app.
    - **ADMIN**: gerencia conteúdo. Criado pelo seed.
servers:
  - url: http://localhost:3333
    description: Desenvolvimento local

tags:
  - name: Health
  - name: Auth

paths:
  /health:
    get:
      tags: [Health]
      summary: Estado da API e das dependências
      responses:
        "200":
          description: Tudo no ar
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Health"
        "503":
          description: Postgres ou Redis fora do ar
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Health"

  /api/v1/auth/register:
    post:
      tags: [Auth]
      summary: Cria uma conta de turista
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/RegisterInput"
      responses:
        "201":
          description: Conta criada
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthResult"
        "400":
          $ref: "#/components/responses/ValidationError"
        "409":
          description: Email já cadastrado
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"

  /api/v1/auth/login:
    post:
      tags: [Auth]
      summary: Entra com email e senha
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/LoginInput"
      responses:
        "200":
          description: Autenticado
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthResult"
        "400":
          $ref: "#/components/responses/ValidationError"
        "401":
          $ref: "#/components/responses/Unauthorized"

  /api/v1/auth/refresh:
    post:
      tags: [Auth]
      summary: Troca um refresh token por um par novo
      description: O refresh token usado é invalidado. Um token já usado, expirado ou revogado responde 401.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/RefreshInput"
      responses:
        "200":
          description: Par novo emitido
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AuthResult"
        "400":
          $ref: "#/components/responses/ValidationError"
        "401":
          $ref: "#/components/responses/Unauthorized"

  /api/v1/auth/logout:
    post:
      tags: [Auth]
      summary: Revoga o refresh token
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/RefreshInput"
      responses:
        "204":
          description: Sessão revogada
        "401":
          $ref: "#/components/responses/Unauthorized"

  /api/v1/auth/me:
    get:
      tags: [Auth]
      summary: Dados do usuário autenticado
      security:
        - bearerAuth: []
      responses:
        "200":
          description: Usuário
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
        "401":
          $ref: "#/components/responses/Unauthorized"

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  responses:
    ValidationError:
      description: Dados inválidos
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/Error"
    Unauthorized:
      description: Token ausente, inválido ou credenciais erradas
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/Error"

  schemas:
    Health:
      type: object
      properties:
        status: { type: string, enum: [ok, degraded] }
        postgres: { type: string, enum: [ok, error] }
        redis: { type: string, enum: [ok, error] }

    Error:
      type: object
      properties:
        error:
          type: object
          properties:
            code: { type: string, example: VALIDATION_ERROR }
            message: { type: string, example: Dados inválidos }
            details:
              type: array
              description: Só em VALIDATION_ERROR
              items:
                type: object
                properties:
                  path: { type: string, example: email }
                  message: { type: string }

    User:
      type: object
      properties:
        id: { type: string, format: uuid }
        name: { type: string }
        email: { type: string, format: email }
        role: { type: string, enum: [ADMIN, TOURIST] }

    AuthResult:
      type: object
      properties:
        user: { $ref: "#/components/schemas/User" }
        accessToken: { type: string, description: JWT válido por 15 minutos }
        refreshToken: { type: string, description: JWT válido por 7 dias, uso único }

    RegisterInput:
      type: object
      required: [name, email, password]
      properties:
        name: { type: string, minLength: 2, maxLength: 80 }
        email: { type: string, format: email }
        password: { type: string, minLength: 8 }

    LoginInput:
      type: object
      required: [email, password]
      properties:
        email: { type: string, format: email }
        password: { type: string }

    RefreshInput:
      type: object
      required: [refreshToken]
      properties:
        refreshToken: { type: string }
```

- [ ] **Step 6: Criar src/app.ts**

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { redis } from "./lib/redis";
import { createAuthRouter } from "./modules/auth/auth.routes";
import { AuthService } from "./modules/auth/auth.service";
import { TokenService } from "./modules/auth/token.service";
import { createHealthRouter } from "./modules/health/health.routes";
import { UsersRepository } from "./modules/users/users.repository";
import { NotFoundError } from "./shared/errors/AppError";
import { errorHandler } from "./shared/middlewares/errorHandler";

function loadOpenApi() {
  const file = path.resolve(process.cwd(), "docs/openapi.yaml");
  return YAML.parse(readFileSync(file, "utf8"));
}

export function createApp() {
  const app = express();
  app.use(express.json());

  const tokens = new TokenService({
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpires: env.JWT_ACCESS_EXPIRES,
    refreshExpires: env.JWT_REFRESH_EXPIRES,
  });
  const users = new UsersRepository(prisma);
  const authService = new AuthService(users, tokens, redis);

  app.use("/health", createHealthRouter({ prisma, redis }));
  app.use("/api/v1/auth", createAuthRouter(authService, tokens));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(loadOpenApi()));

  app.use((_req, _res, next) => next(new NotFoundError("Rota não encontrada")));
  app.use(errorHandler);

  return app;
}
```

- [ ] **Step 7: Criar src/server.ts**

```ts
import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`API no ar em http://localhost:${env.PORT} (docs em /docs)`);
});
```

- [ ] **Step 8: Subir e verificar na mão**

Com Postgres e Redis de dev no ar (Task 2, Step 4):

```powershell
npm run dev
```

Em outro terminal:

```powershell
Invoke-RestMethod http://localhost:3333/health
Invoke-RestMethod -Method Post -Uri http://localhost:3333/api/v1/auth/register -ContentType "application/json" -Body '{"name":"Ana","email":"ana@ex.com","password":"senha1234"}'
```

Expected: health devolve `status ok`; register devolve `user`, `accessToken` e `refreshToken`. Abra `http://localhost:3333/docs` no navegador e confira o Swagger. Depois pare o `npm run dev` com Ctrl+C.

- [ ] **Step 9: Commit**

```powershell
git add src/modules/auth/auth.controller.ts src/modules/auth/auth.routes.ts src/modules/health src/app.ts src/server.ts docs/openapi.yaml
git commit -m "feat: rotas de auth e health, app Express e Swagger"
```

---

## Task 12: Seed do admin

**Files:**
- Create: `prisma/seed.ts`

- [ ] **Step 1: Criar prisma/seed.ts**

```ts
import bcrypt from "bcryptjs";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: env.ADMIN_EMAIL } });
  if (existing) {
    console.log(`Admin ${env.ADMIN_EMAIL} já existe, nada a fazer.`);
    return;
  }

  await prisma.user.create({
    data: {
      name: env.ADMIN_NAME,
      email: env.ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(env.ADMIN_PASSWORD, 10),
      role: "ADMIN",
    },
  });
  console.log(`Admin ${env.ADMIN_EMAIL} criado.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Rodar duas vezes**

```powershell
npm run prisma:seed
npm run prisma:seed
```

Expected: primeira vez "Admin admin@estacao.local criado.", segunda "já existe, nada a fazer.".

- [ ] **Step 3: Conferir login do admin**

```powershell
npm run dev
```

Em outro terminal:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3333/api/v1/auth/login -ContentType "application/json" -Body '{"email":"admin@estacao.local","password":"troque-me-12345"}'
```

Expected: `user.role` igual a `ADMIN`. Pare o servidor.

- [ ] **Step 4: Commit**

```powershell
git add prisma/seed.ts
git commit -m "feat: seed idempotente do admin"
```

---

## Task 13: Testes e2e

**Files:**
- Create: `tests/e2e/setup.ts`, `tests/e2e/health.e2e.test.ts`, `tests/e2e/auth.e2e.test.ts`

- [ ] **Step 1: Criar tests/e2e/setup.ts**

```ts
import { prisma } from "../../src/lib/prisma";
import { redis } from "../../src/lib/redis";

beforeAll(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE');
  await redis.flushdb();
});

afterAll(async () => {
  await prisma.$disconnect();
  await redis.quit();
});
```

- [ ] **Step 2: Criar tests/e2e/health.e2e.test.ts**

```ts
import request from "supertest";
import { createApp } from "../../src/app";

describe("GET /health", () => {
  it("responde 200 com tudo ok", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", postgres: "ok", redis: "ok" });
  });

  it("rota desconhecida responde 404 padronizado", async () => {
    const res = await request(createApp()).get("/nada");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
```

- [ ] **Step 3: Criar tests/e2e/auth.e2e.test.ts**

```ts
import request from "supertest";
import { createApp } from "../../src/app";

const app = createApp();
const ana = { name: "Ana", email: "ana@ex.com", password: "senha1234" };

describe("fluxo de auth", () => {
  let accessToken: string;
  let refreshToken: string;

  it("POST /register cria a conta e devolve tokens", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(ana);
    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: "Ana",
      email: "ana@ex.com",
      role: "TOURIST",
    });
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
  });

  it("POST /register com email repetido responde 409", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(ana);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("POST /register com body inválido responde 400 com details", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "A", email: "x", password: "123" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      "email",
      "name",
      "password",
    ]);
  });

  it("POST /login com senha errada responde 401", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ana.email, password: "errada123" });
    expect(res.status).toBe(401);
  });

  it("POST /login com credenciais certas devolve tokens", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ana.email, password: ana.password });
    expect(res.status).toBe(200);
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it("GET /me sem token responde 401", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /me com token devolve o usuário", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(ana.email);
  });

  it("POST /refresh rotaciona e invalida o antigo", async () => {
    const first = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(refreshToken);

    const reuse = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(reuse.status).toBe(401);

    accessToken = first.body.accessToken;
    refreshToken = first.body.refreshToken;
  });

  it("POST /logout revoga o refresh token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(res.status).toBe(204);

    const after = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(after.status).toBe(401);
  });
});
```

- [ ] **Step 4: Rodar os e2e**

```powershell
npm run test:e2e
```

Expected: sobe `postgres-test` e `redis-test`, aplica migrations, PASS em 2 suítes (11 testes), derruba a infra. Se algum teste falhar, a infra fica no ar; derrube com `npm run test:e2e:down` depois de investigar.

- [ ] **Step 5: Rodar também os unitários, para garantir que nada quebrou**

```powershell
npm test
```

Expected: PASS em 6 suítes.

- [ ] **Step 6: Commit**

```powershell
git add tests
git commit -m "test: e2e de health e do fluxo completo de auth"
```

---

## Task 14: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Escrever README.md**

````markdown
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

Para rodar tudo dentro do Docker, inclusive a API com hot reload:

```bash
docker compose up --build
```

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `NODE_ENV` | `development`, `test` ou `production` |
| `PORT` | Porta da API |
| `DATABASE_URL` | Conexão Postgres. No `.env` usa `localhost`; dentro do Compose é sobrescrita para o serviço `postgres` |
| `REDIS_URL` | Conexão Redis. Mesma regra acima |
| `JWT_ACCESS_SECRET` | Segredo do access token |
| `JWT_REFRESH_SECRET` | Segredo do refresh token |
| `JWT_ACCESS_EXPIRES` | Validade do access token (`15m`) |
| `JWT_REFRESH_EXPIRES` | Validade do refresh token (`7d`) |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin criado pelo seed |

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
4. `POST /api/v1/auth/logout` revoga o refresh token.

Refresh tokens ficam no Redis com TTL. Não existem no Postgres.

## Estrutura

```
prisma/               schema, migrations e seed
docs/openapi.yaml     documentação da API
src/
  app.ts              composição: middlewares, rotas, swagger, error handler
  server.ts           sobe a porta
  config/env.ts       variáveis de ambiente validadas
  lib/                clientes Prisma e Redis
  shared/
    errors/           AppError e subclasses
    middlewares/      errorHandler, validate, authenticate, authorize
    cache/            helper de cache no Redis
  modules/
    health/
    users/
    auth/
tests/e2e/            testes de ponta a ponta
```

## Padrão de módulo

Cada módulo é uma pasta em `src/modules/<nome>` com:

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
3. Exponha uma função `create<Nome>Router(deps)` e monte em `src/app.ts` sob `/api/v1/<nome>`.
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

Os e2e usam `.env.test` (portas 5433 e 6380) e limpam o banco e o Redis antes de cada arquivo. Se um e2e falhar, a infra fica no ar para investigação; derrube com `npm run test:e2e:down`.

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

1. Fundação (auth, infra, testes) — este estado
2. Cachoeiras, com upload de imagem e cache
3. Pontos turísticos
4. Eventos
5. Guias, com WhatsApp e Instagram
6. Hospedagem e restaurantes
7. Favoritos e salvos do turista

Os specs de design ficam em `docs/superpowers/specs`.
````

- [ ] **Step 2: Commit**

```powershell
git add README.md
git commit -m "docs: README completo"
```

---

## Task 15: Verificação do build Docker

**Files:** nenhum novo.

- [ ] **Step 1: Buildar a imagem de produção**

```powershell
docker build --target prod -t estacao-api:test .
```

Expected: build termina sem erro.

- [ ] **Step 2: Subir a API pelo Compose e checar o health**

```powershell
docker compose up -d --build --wait
Invoke-RestMethod http://localhost:3333/health
```

Expected: `status ok`. Se `--wait` reclamar que `api` não tem healthcheck, aguarde alguns segundos e repita o `Invoke-RestMethod`.

- [ ] **Step 3: Derrubar**

```powershell
docker compose down
```

Nada a commitar nesta task, a menos que algum ajuste tenha sido necessário. Nesse caso commite com `fix: ajustes no docker`.

---

## Task 16: Typecheck final do servidor

- [ ] **Step 1: Rodar tudo**

```powershell
npm run typecheck
npm test
```

Expected: zero erros de tipo, todos os unitários passando.

- [ ] **Step 2: Conferir o git**

```powershell
git status
git log --oneline
```

Expected: árvore limpa, commits das Tasks 1 a 14 presentes.

---

## Task 17: App — branch, rename de Data e fontes

**Files:**
- Rename: `src/Data` → `src/data`
- Modify: `src/AppRoutes.tsx`

Diretório: `C:\Users\vitpe\projetos\Estacao-Pedro-II`.

- [ ] **Step 1: Criar a branch e instalar dependências**

```powershell
git checkout master
git checkout -b joao/changes
npm install
```

- [ ] **Step 2: Renomear a pasta em dois passos (Windows não diferencia maiúsculas)**

```powershell
git mv src/Data src/data_tmp
git mv src/data_tmp src/data
git status
```

Expected: `git status` lista os 6 arquivos como renomeados de `src/Data/...` para `src/data/...`.

- [ ] **Step 3: Corrigir os pesos de fonte em src/AppRoutes.tsx**

Troque o bloco `fonts` do tema por:

```tsx
fonts: {
    ...DefaultTheme.fonts,
    regular: {
        fontFamily: Theme.fonts.poppinsRegular,
        fontWeight: "400"
    },
    bold: {
        fontFamily: Theme.fonts.poppinsBold,
        fontWeight: "700"
    }
},
```

- [ ] **Step 4: Typecheck**

```powershell
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 5: Commit**

```powershell
git add -A
git commit -m "fix: pasta data em minúsculo e pesos de fonte no tema"
```

---

## Task 18: App — sessão e cliente HTTP

**Files:**
- Create: `src/services/session.ts`, `src/services/api.ts`, `src/services/authApi.ts`, `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Instalar expo-secure-store**

```powershell
npx expo install expo-secure-store
```

- [ ] **Step 2: Configurar a URL da API**

Adicione ao final de `.gitignore`:

```
.env
```

Crie `.env.example`:

```
# Emulador Android: http://10.0.2.2:3333
# Celular físico na mesma rede: http://<IP-da-sua-máquina>:3333
EXPO_PUBLIC_API_URL=http://10.0.2.2:3333
```

Crie `.env` copiando o exemplo e ajustando ao seu caso:

```powershell
Copy-Item .env.example .env
```

- [ ] **Step 3: Criar src/services/session.ts**

```ts
import * as SecureStore from "expo-secure-store";

const KEYS = {
    access: "accessToken",
    refresh: "refreshToken",
    guest: "guest",
} as const;

export type Tokens = { accessToken: string; refreshToken: string };

export const session = {
    getAccessToken: () => SecureStore.getItemAsync(KEYS.access),

    getRefreshToken: () => SecureStore.getItemAsync(KEYS.refresh),

    async saveTokens({ accessToken, refreshToken }: Tokens) {
        await SecureStore.setItemAsync(KEYS.access, accessToken);
        await SecureStore.setItemAsync(KEYS.refresh, refreshToken);
        await SecureStore.deleteItemAsync(KEYS.guest);
    },

    async isGuest() {
        return (await SecureStore.getItemAsync(KEYS.guest)) === "true";
    },

    setGuest: () => SecureStore.setItemAsync(KEYS.guest, "true"),

    async clear() {
        await SecureStore.deleteItemAsync(KEYS.access);
        await SecureStore.deleteItemAsync(KEYS.refresh);
        await SecureStore.deleteItemAsync(KEYS.guest);
    },
};
```

- [ ] **Step 4: Criar src/services/api.ts**

```ts
import { session, type Tokens } from "./session";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export type Role = "ADMIN" | "TOURIST";

export type User = { id: string; name: string; email: string; role: Role };

export type AuthResponse = Tokens & { user: User };

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

type Options = {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
    auth?: boolean;
};

async function rawRequest<T>(path: string, options: Options, token: string | null): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (res.status === 204) return undefined as T;

    const data = await res.json();
    if (!res.ok) {
        throw new ApiError(
            res.status,
            data?.error?.code ?? "UNKNOWN",
            data?.error?.message ?? "Erro inesperado",
        );
    }
    return data as T;
}

export async function refreshSession(): Promise<AuthResponse | null> {
    const refreshToken = await session.getRefreshToken();
    if (!refreshToken) return null;
    try {
        const result = await rawRequest<AuthResponse>(
            "/api/v1/auth/refresh",
            { method: "POST", body: { refreshToken }, auth: false },
            null,
        );
        await session.saveTokens(result);
        return result;
    } catch {
        await session.clear();
        return null;
    }
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
    const useAuth = options.auth !== false;
    const token = useAuth ? await session.getAccessToken() : null;

    try {
        return await rawRequest<T>(path, options, token);
    } catch (err) {
        const expired = err instanceof ApiError && err.status === 401 && useAuth;
        if (!expired) throw err;

        const refreshed = await refreshSession();
        if (!refreshed) throw err;
        return rawRequest<T>(path, options, refreshed.accessToken);
    }
}
```

- [ ] **Step 5: Criar src/services/authApi.ts**

```ts
import { api, type AuthResponse, type User } from "./api";
import { session } from "./session";

export async function signUp(name: string, email: string, password: string): Promise<User> {
    const result = await api<AuthResponse>("/api/v1/auth/register", {
        method: "POST",
        body: { name, email, password },
        auth: false,
    });
    await session.saveTokens(result);
    return result.user;
}

export async function signIn(email: string, password: string): Promise<User> {
    const result = await api<AuthResponse>("/api/v1/auth/login", {
        method: "POST",
        body: { email, password },
        auth: false,
    });
    await session.saveTokens(result);
    return result.user;
}

export async function signOut(): Promise<void> {
    const refreshToken = await session.getRefreshToken();
    if (refreshToken) {
        try {
            await api<void>("/api/v1/auth/logout", { method: "POST", body: { refreshToken } });
        } catch {
            // sem rede ou token já inválido: a sessão local é limpa mesmo assim
        }
    }
    await session.clear();
}
```

- [ ] **Step 6: Typecheck**

```powershell
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 7: Commit**

```powershell
git add .gitignore .env.example package.json package-lock.json src/services
git commit -m "feat: cliente HTTP com refresh automático e sessão no SecureStore"
```

---

## Task 19: App — AuthContext

**Files:**
- Create: `src/contexts/AuthContext.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Criar src/contexts/AuthContext.tsx**

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { refreshSession, type User } from "@/services/api";
import * as authApi from "@/services/authApi";
import { session } from "@/services/session";

type AuthContextValue = {
    user: User | null;
    isGuest: boolean;
    isLoading: boolean;
    signIn: (email: string, password: string) => Promise<void>;
    signUp: (name: string, email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    continueAsGuest: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isGuest, setIsGuest] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const refreshed = await refreshSession();
                if (refreshed) {
                    setUser(refreshed.user);
                } else if (await session.isGuest()) {
                    setIsGuest(true);
                }
            } finally {
                setIsLoading(false);
            }
        })();
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        setUser(await authApi.signIn(email, password));
        setIsGuest(false);
    }, []);

    const signUp = useCallback(async (name: string, email: string, password: string) => {
        setUser(await authApi.signUp(name, email, password));
        setIsGuest(false);
    }, []);

    const signOut = useCallback(async () => {
        await authApi.signOut();
        setUser(null);
        setIsGuest(false);
    }, []);

    const continueAsGuest = useCallback(async () => {
        await session.setGuest();
        setIsGuest(true);
    }, []);

    return (
        <AuthContext.Provider
            value={{ user, isGuest, isLoading, signIn, signUp, signOut, continueAsGuest }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider");
    return ctx;
}
```

- [ ] **Step 2: Envolver o app em src/App.tsx**

Substitua o `return` de `App` por:

```tsx
return (
    <AuthProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: Theme.colors.neutralWhite }}>
            <StatusBar style="light" />
            <AppRoutes />
        </SafeAreaView>
    </AuthProvider>
);
```

E adicione o import no topo:

```tsx
import { AuthProvider } from "@/contexts/AuthContext";
```

- [ ] **Step 3: Typecheck**

```powershell
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 4: Commit**

```powershell
git add src/contexts src/App.tsx
git commit -m "feat: AuthContext com sessão persistida e modo convidado"
```

---

## Task 20: App — componentes Button e Input

**Files:**
- Create: `src/shared/Components/Button/index.tsx`, `src/shared/Components/Button/styles.ts`, `src/shared/Components/Input/index.tsx`, `src/shared/Components/Input/styles.ts`

- [ ] **Step 1: Criar src/shared/Components/Button/index.tsx**

```tsx
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";

import { Theme } from "@/shared/Themes";
import { styles } from "./styles";

type Props = {
    title: string;
    onPress: () => void;
    variant?: "primary" | "outline" | "link";
    loading?: boolean;
    disabled?: boolean;
};

export const Button = ({ title, onPress, variant = "primary", loading = false, disabled = false }: Props) => {
    const isPrimary = variant === "primary";
    const containerStyle =
        variant === "primary" ? styles.primary : variant === "outline" ? styles.outline : styles.link;
    const textStyle = isPrimary ? styles.textPrimary : styles.textSecondary;

    return (
        <TouchableOpacity
            style={[containerStyle, (disabled || loading) && styles.disabled]}
            onPress={onPress}
            disabled={disabled || loading}
        >
            {loading ? (
                <ActivityIndicator color={isPrimary ? Theme.colors.neutralWhite : Theme.colors.primary500} />
            ) : (
                <Text style={textStyle}>{title}</Text>
            )}
        </TouchableOpacity>
    );
};
```

- [ ] **Step 2: Criar src/shared/Components/Button/styles.ts**

```ts
import { StyleSheet } from "react-native";

import { Theme } from "@/shared/Themes";

const base = {
    height: 52,
    borderRadius: 26,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 24,
};

export const styles = StyleSheet.create({
    primary: {
        ...base,
        backgroundColor: Theme.colors.primary500,
    },
    outline: {
        ...base,
        borderWidth: 2,
        borderColor: Theme.colors.primary500,
    },
    link: {
        ...base,
        height: 44,
    },
    disabled: {
        opacity: 0.6,
    },
    textPrimary: {
        fontFamily: Theme.fonts.poppinsBold,
        fontSize: Theme.fontSize.body,
        color: Theme.colors.neutralWhite,
    },
    textSecondary: {
        fontFamily: Theme.fonts.poppinsBold,
        fontSize: Theme.fontSize.body,
        color: Theme.colors.primary500,
    },
});
```

- [ ] **Step 3: Criar src/shared/Components/Input/index.tsx**

```tsx
import { Text, TextInput, View, type TextInputProps } from "react-native";

import { styles } from "./styles";

type Props = TextInputProps & {
    label: string;
};

export const Input = ({ label, ...inputProps }: Props) => {
    return (
        <View style={styles.container}>
            <Text style={styles.label}>{label}</Text>
            <TextInput style={styles.input} placeholderTextColor="#9A9AA8" {...inputProps} />
        </View>
    );
};
```

- [ ] **Step 4: Criar src/shared/Components/Input/styles.ts**

```ts
import { StyleSheet } from "react-native";

import { Theme } from "@/shared/Themes";

export const styles = StyleSheet.create({
    container: {
        gap: 6,
    },
    label: {
        fontFamily: Theme.fonts.poppinsBold,
        fontSize: Theme.fontSize.button,
        color: Theme.colors.neutralBlack,
    },
    input: {
        height: 52,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#D9D9E3",
        backgroundColor: "#FFFFFF",
        paddingHorizontal: 16,
        fontFamily: Theme.fonts.poppinsRegular,
        fontSize: Theme.fontSize.body,
        color: Theme.colors.neutralBlack,
    },
});
```

- [ ] **Step 5: Typecheck e commit**

```powershell
npx tsc --noEmit
git add src/shared/Components/Button src/shared/Components/Input
git commit -m "feat: componentes Button e Input"
```

---

## Task 21: App — telas Welcome, SignIn e SignUp e navegação

**Files:**
- Create: `src/pages/Welcome/index.tsx`, `src/pages/Welcome/styles.ts`, `src/pages/SignIn/index.tsx`, `src/pages/SignUp/index.tsx`, `src/pages/AuthForm.styles.ts`
- Modify: `src/AppRoutes.tsx`

- [ ] **Step 1: Criar src/pages/Welcome/index.tsx**

```tsx
import { Image, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { TSScreenDefinitionsProps } from "@/AppRoutes";
import { useAuth } from "@/contexts/AuthContext";
import { Images } from "@/shared/Assets";
import { Button } from "@/shared/Components/Button";
import { styles } from "./styles";

export const Welcome = () => {
    const navigation = useNavigation<TSScreenDefinitionsProps>();
    const { continueAsGuest } = useAuth();

    return (
        <View style={styles.container}>
            <View style={styles.hero}>
                <Image source={Images.logoBlue} />
                <Text style={styles.title}>Estação Pedro II</Text>
                <Text style={styles.subtitle}>Explore cultura, natureza e eventos da cidade.</Text>
            </View>

            <View style={styles.actions}>
                <Button title="Entrar" onPress={() => navigation.navigate("SignIn")} />
                <Button title="Criar conta" variant="outline" onPress={() => navigation.navigate("SignUp")} />
                <Button title="Continuar como convidado" variant="link" onPress={continueAsGuest} />
            </View>
        </View>
    );
};
```

- [ ] **Step 2: Criar src/pages/Welcome/styles.ts**

```ts
import { StyleSheet } from "react-native";

import { Theme } from "@/shared/Themes";

export const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 24,
        paddingVertical: 48,
        justifyContent: "space-between",
    },
    hero: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
    },
    title: {
        fontFamily: Theme.fonts.poppinsBold,
        fontSize: Theme.fontSize.h5,
        color: Theme.colors.neutralBlack,
    },
    subtitle: {
        fontFamily: Theme.fonts.poppinsRegular,
        fontSize: Theme.fontSize.body,
        color: Theme.colors.neutralBlack,
        textAlign: "center",
    },
    actions: {
        gap: 12,
    },
});
```

- [ ] **Step 3: Criar src/pages/AuthForm.styles.ts (compartilhado por SignIn e SignUp)**

```ts
import { StyleSheet } from "react-native";

import { Theme } from "@/shared/Themes";

export const authFormStyles = StyleSheet.create({
    container: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingVertical: 32,
        gap: 24,
    },
    title: {
        fontFamily: Theme.fonts.poppinsBold,
        fontSize: Theme.fontSize.h5,
        color: Theme.colors.neutralBlack,
    },
    form: {
        gap: 16,
    },
    error: {
        fontFamily: Theme.fonts.poppinsRegular,
        fontSize: Theme.fontSize.button,
        color: "#C62828",
    },
});
```

- [ ] **Step 4: Criar src/pages/SignIn/index.tsx**

```tsx
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { TSScreenDefinitionsProps } from "@/AppRoutes";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/services/api";
import { Button } from "@/shared/Components/Button";
import { Input } from "@/shared/Components/Input";
import { authFormStyles as styles } from "../AuthForm.styles";

export const SignIn = () => {
    const navigation = useNavigation<TSScreenDefinitionsProps>();
    const { signIn } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit() {
        setError(null);
        setLoading(true);
        try {
            await signIn(email.trim(), password);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor");
        } finally {
            setLoading(false);
        }
    }

    return (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Entrar</Text>

            <View style={styles.form}>
                <Input
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="voce@exemplo.com"
                />
                <Input
                    label="Senha"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholder="Sua senha"
                />
                {error && <Text style={styles.error}>{error}</Text>}
            </View>

            <Button title="Entrar" onPress={handleSubmit} loading={loading} disabled={!email || !password} />
            <Button title="Ainda não tenho conta" variant="link" onPress={() => navigation.navigate("SignUp")} />
        </ScrollView>
    );
};
```

- [ ] **Step 5: Criar src/pages/SignUp/index.tsx**

```tsx
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { TSScreenDefinitionsProps } from "@/AppRoutes";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/services/api";
import { Button } from "@/shared/Components/Button";
import { Input } from "@/shared/Components/Input";
import { authFormStyles as styles } from "../AuthForm.styles";

export const SignUp = () => {
    const navigation = useNavigation<TSScreenDefinitionsProps>();
    const { signUp } = useAuth();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const canSubmit = name.trim().length >= 2 && email.length > 0 && password.length >= 8;

    async function handleSubmit() {
        setError(null);
        setLoading(true);
        try {
            await signUp(name.trim(), email.trim(), password);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor");
        } finally {
            setLoading(false);
        }
    }

    return (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Criar conta</Text>

            <View style={styles.form}>
                <Input label="Nome" value={name} onChangeText={setName} placeholder="Seu nome" />
                <Input
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="voce@exemplo.com"
                />
                <Input
                    label="Senha"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    placeholder="Mínimo de 8 caracteres"
                />
                {error && <Text style={styles.error}>{error}</Text>}
            </View>

            <Button title="Criar conta" onPress={handleSubmit} loading={loading} disabled={!canSubmit} />
            <Button title="Já tenho conta" variant="link" onPress={() => navigation.navigate("SignIn")} />
        </ScrollView>
    );
};
```

- [ ] **Step 6: Reescrever src/AppRoutes.tsx com as duas pilhas**

```tsx
import { createStackNavigator } from '@react-navigation/stack';
import { DefaultTheme, NavigationContainer, NavigationProp } from '@react-navigation/native';

import { useAuth } from '@/contexts/AuthContext';
import { Home } from './pages/Home';
import { DetailsWaterfall } from './pages/DetailsWaterfall'
import { DetailsAttraction } from './pages/DetailsAttraction'
import { Welcome } from './pages/Welcome';
import { SignIn } from './pages/SignIn';
import { SignUp } from './pages/SignUp';
import { Theme } from './shared/Themes';



type TScreenDefinitions = {
    Welcome: undefined;
    SignIn: undefined;
    SignUp: undefined;
    Home: undefined,
    DetailsWaterfall: {
        id: number;
    };
    DetailsAttraction: {
        id: number
    };
}

const Stack = createStackNavigator<TScreenDefinitions>();

const navigationTheme = {
    ...DefaultTheme,
    fonts: {
        ...DefaultTheme.fonts,
        regular: {
            fontFamily: Theme.fonts.poppinsRegular,
            fontWeight: "400" as const
        },
        bold: {
            fontFamily: Theme.fonts.poppinsBold,
            fontWeight: "700" as const
        }
    },
    colors: {
        ...DefaultTheme.colors,
        background: Theme.colors.neutralWhite,
        primary: Theme.colors.primary500,
        text: Theme.colors.neutralBlack
    }
};

export function AppRoutes() {
    const { user, isGuest, isLoading } = useAuth();

    if (isLoading) return null;

    const hasSession = user !== null || isGuest;

    return (
        <NavigationContainer theme={navigationTheme}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {hasSession ? (
                    <>
                        <Stack.Screen name="Home" component={Home} />
                        <Stack.Screen name="DetailsWaterfall" component={DetailsWaterfall} />
                        <Stack.Screen name='DetailsAttraction' component={DetailsAttraction} />
                    </>
                ) : (
                    <>
                        <Stack.Screen name="Welcome" component={Welcome} />
                        <Stack.Screen name="SignIn" component={SignIn} />
                        <Stack.Screen name="SignUp" component={SignUp} />
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}

export type TSScreenDefinitionsProps = NavigationProp<TScreenDefinitions>
```

- [ ] **Step 7: Typecheck**

```powershell
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 8: Testar no dispositivo ou emulador**

Com o servidor rodando (`npm run dev` no repo do servidor, ou `docker compose up`), e `EXPO_PUBLIC_API_URL` apontando para ele:

```powershell
npx expo start --clear
```

Verifique:

1. Abre na tela Welcome.
2. "Continuar como convidado" leva para a Home. Feche e reabra o app: continua na Home.
3. Limpe os dados do app (ou desinstale) e abra de novo: Welcome. "Criar conta" com dados válidos leva para a Home.
4. Feche e reabra: continua logado (o refresh no boot funcionou).
5. Email repetido no cadastro mostra "Email já cadastrado". Senha errada no login mostra "Email ou senha inválidos".
6. Com o servidor parado, o login mostra "Não foi possível conectar ao servidor".

- [ ] **Step 9: Commit**

```powershell
git add src/pages/Welcome src/pages/SignIn src/pages/SignUp src/pages/AuthForm.styles.ts src/AppRoutes.tsx
git commit -m "feat: telas de boas-vindas, login e cadastro com modo convidado"
```

---

## Task 22: App — botão de sair na Home

**Files:**
- Modify: `src/pages/Home/index.tsx`, `src/pages/Home/styles.ts`

Sem isso não há como testar o logout nem trocar de conta.

- [ ] **Step 1: Adicionar o botão no header da Home**

Em `src/pages/Home/index.tsx`, adicione os imports:

```tsx
import { TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
```

(Junte o `TouchableOpacity` ao import existente de `react-native`.)

Dentro do componente, logo após `const navigation = ...`:

```tsx
const { user, signOut } = useAuth();
```

Substitua o bloco `<View style={styles.header}>...</View>` por:

```tsx
<View style={styles.header}>

    <View style={styles.containerLogo}>
        <Image source={Images.logoBlue} />
        <View>
            <Text style={styles.title}>Bem vindo(a){user ? `, ${user.name}` : ""}</Text>
            <Text style={styles.subtitle}>Estação Pedro II</Text>
        </View>
    </View>

    <TouchableOpacity style={styles.signOut} onPress={signOut} accessibilityLabel="Sair">
        <Feather name="log-out" size={22} color={Theme.colors.primary500} />
    </TouchableOpacity>

</View>
```

E importe o tema:

```tsx
import { Theme } from '@/shared/Themes';
```

- [ ] **Step 2: Adicionar o estilo em src/pages/Home/styles.ts**

Dentro de `StyleSheet.create({ ... })`, depois de `containerLogo`:

```ts
signOut: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
},
```

- [ ] **Step 3: Typecheck e teste manual**

```powershell
npx tsc --noEmit
npx expo start --clear
```

Expected: o header mostra o nome do usuário logado (ou só "Bem vindo(a)" para convidado). Tocar no ícone de sair volta para a Welcome, e reabrir o app continua na Welcome.

- [ ] **Step 4: Commit**

```powershell
git add src/pages/Home
git commit -m "feat: botão de sair e nome do usuário na Home"
```

---

## Self-review

**Cobertura do spec:**

| Seção do spec | Task |
|---|---|
| 3 Stack, 4 Estrutura | 1, 2, 3 |
| 5 Convenções HTTP (prefixo, /docs, /health, erros) | 4, 11 |
| 6 Dados (User, roles, seed, Redis keys) | 3, 6, 10, 12 |
| 7 Auth (rotas, validação, tokens, rotação, middlewares) | 8, 9, 10, 11 |
| 8 Config e Docker (env, compose, Dockerfile, scripts) | 1, 2, 15 |
| 9 Testes unitários | 4, 5, 6, 8, 9, 10 |
| 9 Testes e2e | 13 |
| 10 Documentação (openapi, README) | 11, 14 |
| 11 Integração com o app (api, secure-store, context, telas, correções) | 17 a 22 |

**Consistência de nomes:** `TokenService.signAccess/signRefresh/verifyAccess/verifyRefresh`, `UsersRepository.findByEmail/findById/create`, `AuthService.register/login/refresh/logout/me`, `RefreshStore`, `CacheStore`, `createCache`, `createAuthRouter(service, tokens)`, `createHealthRouter({ prisma, redis })`, `authenticate(tokens)`, `authorize(...roles)`, `validate({ body, params })`, `errorHandler`, `createApp`. No app: `session`, `api`, `refreshSession`, `ApiError`, `authApi.signIn/signUp/signOut`, `useAuth`.

**Fora do escopo, de propósito:** upload de imagem, módulos de conteúdo, favoritos, recuperação de senha, rate limit, CI e deploy.
