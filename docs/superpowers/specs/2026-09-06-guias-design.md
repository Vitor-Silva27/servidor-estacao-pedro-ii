# Módulo de guias — Estação Pedro II

Data: 2026-09-06
Status: aprovado para planejamento
Depende de: fundação, atrações e eventos

## 1. Contexto

O app mostra um único guia estático, João Lucas, em toda tela de detalhe de atração, com ícones de WhatsApp e Instagram que não fazem nada. Este módulo coloca os guias no servidor, liga cada guia às atrações em que atua, e faz os ícones abrirem contato de verdade.

## 2. Decisões

| Tema | Decisão |
|---|---|
| Relação | Muitos-para-muitos entre guia e atração, relação implícita do Prisma |
| Onde a ligação é gerida | No guia, por `attractionIds`. Nada pelo lado da atração |
| Contato | `whatsapp` obrigatório, `instagram` e `description` opcionais |
| Foto | Um avatar por guia, substituído a cada upload. Sem galeria |
| Exposição | `GET /attractions/:id` passa a incluir `guides[]` |
| Admin no app | Lista e formulário com checklist de atrações, tudo marcado por padrão na criação |
| Seed | João Lucas com foto, ligado a todas as atrações |

## 3. Modelo de dados

```prisma
model Guide {
  id          String       @id @default(uuid())
  name        String
  description String?
  whatsapp    String
  instagram   String?
  photoUrl    String?
  attractions Attraction[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}
```

`Attraction` ganha `guides Guide[]`. O Prisma cria a tabela de junção `_AttractionToGuide`.

Validação e normalização (zod, um schema para criar e editar):

- `name` 2 a 120.
- `description` opcional, texto não vazio.
- `whatsapp`: string; o schema remove tudo que não é dígito e exige 12 ou 13 dígitos (DDI 55 + DDD + 8 ou 9 dígitos). Guardado só com dígitos, ex.: `5586999990000`. Mensagem de erro: "Informe DDI, DDD e número, ex.: 55 86 99999-0000".
- `instagram`: opcional; o schema remove `@` e espaços e exige `^[A-Za-z0-9._]{1,30}$`. Guardado sem `@`.
- `attractionIds`: array de UUID, pode ser vazio, sem repetidos. O service confere que todos existem; se algum não existir, `ValidationError` com `path` `attractionIds` e mensagem "Atração inexistente: <id>".

## 4. Rotas

Prefixo `/api/v1/guides`. Leitura pública; escrita `authenticate` + `authorize("ADMIN")`.

| Método | Rota | Comportamento |
|---|---|---|
| GET | `/` | Lista ordenada por `name`. Item: `{ id, name, description, whatsapp, instagram, photoUrl, attractionIds }` |
| GET | `/:id` | Mesmo formato. 404 se não existe |
| POST | `/` | Cria com ligações. 201 |
| PUT | `/:id` | Atualiza campos e substitui as ligações pelo array enviado. 200 |
| DELETE | `/:id` | Apaga guia, ligações (o Prisma cuida) e a foto. 204 |
| POST | `/:id/photo` | Multipart `file` (mesmo `uploadImage`). Salva em `uploads/guides/<id>/`, apaga o arquivo anterior se havia, grava `photoUrl`. 200 com o guia |

`GET /attractions/:id` ganha `guides: [{ id, name, description, whatsapp, instagram, photoUrl }]` ordenados por `name`. A listagem de atrações não muda.

### Cache

- `guides:list` e `guides:<id>`, TTL 60 s.
- Toda escrita em guia apaga `guides:list`, `guides:<id>` e `attractions:<id>` de cada atração ligada antes e depois da mudança (união dos dois conjuntos). Foto também, porque `photoUrl` aparece no detalhe da atração.
- Apagar uma atração não precisa mexer em `guides:*`: `attractionIds` na resposta do guia é derivado da junção, que o Prisma limpa, e o cache do guia expira em 60 s. Aceitável.

## 5. Estrutura no servidor

```
src/modules/guides/
  guides.routes.ts
  guides.controller.ts
  guides.service.ts
  guides.repository.ts
  guides.schemas.ts
  guides.service.test.ts
prisma/seed/guides.ts
prisma/seed/images/joaoLucas.png
tests/e2e/guides.e2e.test.ts
```

`GuidesRepository`: `findMany`, `findById`, `create(data, attractionIds)`, `update(id, data, attractionIds)` com `attractions: { set: ids.map(id => ({ id })) }`, `delete`, `setPhotoUrl(id, url)`. Todos incluem `attractions: { select: { id: true } }` para derivar `attractionIds`.

`AttractionsRepository`: `findById` inclui `guides` ordenados por `name`; ganha `existingIds(ids: string[]): Promise<string[]>`.

`GuidesService` recebe `GuidesRepository`, `AttractionsRepository`, `Cache` e `Storage`. Métodos `list`, `getById`, `create`, `update`, `remove`, `setPhoto(id, PhotoInput)`.

`AttractionsService.toDetail` mapeia `guides` para o formato público. `AttractionDetail` ganha `guides: GuideSummary[]`.

### Seed

`prisma/seed/guides.ts`, chamado por último. João Lucas: `whatsapp` `5586999990000` (fictício, anotado no README), `instagram` ausente, `description` "Guia local de trilhas e cachoeiras", foto `joaoLucas.png`, `attractionIds` = todos os ids de atração existentes. Idempotente por nome.

### Testes

Unitários (`guides.service.test.ts`, tudo mockado):

- Schema: WhatsApp "(86) 99999-0000" com DDI ausente é rejeitado; "+55 (86) 99999-0000" vira `5586999990000`; 11 dígitos rejeitado; Instagram "@Joao.Lucas " vira `Joao.Lucas`; `attractionIds` repetidos rejeitados.
- `create` com id de atração inexistente lança `ValidationError` com `path` `attractionIds`.
- `create` e `update` invalidam `guides:list`, `guides:<id>` e `attractions:<id>` das ligações antigas e novas.
- `setPhoto` salva, apaga a anterior quando existe, grava a URL e invalida.
- `remove` apaga a foto e invalida.

Em `attractions.service.test.ts`: `getById` inclui `guides` no formato público.

E2E (`guides.e2e.test.ts`): cria duas atrações; `POST /guides` com máscara no WhatsApp devolve normalizado e ligado à primeira; `GET /attractions/:id` da primeira traz o guia e o da segunda não; `PUT` trocando para a segunda inverte; `attractionIds` inválido dá 400 no campo; upload da foto duas vezes deixa só o segundo arquivo em disco; `DELETE` some do detalhe da atração. `setup.ts` trunca também `"Guide"` e `"_AttractionToGuide"`.

### Docs

OpenAPI: tag Guides, 6 paths, schemas `Guide`, `GuideInput`, `GuideSummary`, e `guides` em `Attraction`. README: seção Guias e roteiro.

## 6. App, turista

- `src/services/guidesApi.ts`: tipos `GuideSummary`, `Guide`, `GuideInput`; `listGuides`, `getGuide`, `createGuide`, `updateGuide`, `deleteGuide`, `uploadGuidePhoto`; helpers `whatsappUrl(whatsapp, attractionName)` → `https://wa.me/<whatsapp>?text=<encodeURIComponent("Olá! Vi seu contato no app Estação Pedro II e quero informações sobre <nome>")>` e `instagramUrl(handle)` → `https://instagram.com/<handle>`.
- `Attraction` em `attractionsApi.ts` ganha `guides: GuideSummary[]`.
- `GuideCards` passa a receber `{ guide: GuideSummary; attractionName: string }`. Foto de `imageUrl(photoUrl)` com placeholder de ícone quando `null`. Mostra `description` quando existe. Ícone de WhatsApp abre `whatsappUrl`; ícone de Instagram só aparece se houver handle e abre `instagramUrl`. Usa `Linking.openURL`; em erro, `Alert.alert("Não foi possível abrir o aplicativo")`.
- `AttractionDetails` usa `attraction.guides`. Lista vazia mostra "Nenhum guia cadastrado para esta atração".
- Removidos `src/data/guides.ts` e `src/shared/Assets/Images/joaoLucas.png`. `src/data` fica só com `categories.ts`.

## 7. App, admin

- `AdminMenu` ganha o item Guias → `AdminGuides`.
- **AdminGuides**: `listGuides()`; item com foto ou placeholder, nome, WhatsApp formatado e "N atrações". Criar, editar, apagar com confirmação.
- **AdminGuideForm**: recebe `{ id?: string }`. Avatar com botão "Escolher foto" (`expo-image-picker`, guarda o `uri` escolhido). Campos nome, descrição (multiline), WhatsApp, Instagram. Checklist de atrações carregado com `listAttractions()`: na criação todas marcadas; na edição marcadas as de `attractionIds`. Ao salvar: `createGuide` ou `updateGuide`; se há foto nova escolhida, `uploadGuidePhoto`; depois `goBack`. Erros por campo de `details[].path`, inclusive `attractionIds` exibido abaixo do checklist.
- Componente `Checklist` em `src/shared/Components/Checklist`: props `label`, `items: { id, label }[]`, `selected: string[]`, `onChange(ids)`, `error?`. Cada linha com ícone `check-square`/`square` do Feather.
- Rotas: `AdminGuides`, `AdminGuideForm: { id?: string }`.

## 8. Fora do escopo

- Guias em eventos.
- Avaliação, disponibilidade ou preço de guias.
- Mais de uma foto por guia.
- Gestão das ligações pelo lado da atração.

## 9. Ordem de implementação

1. Servidor: schema, migration, schemas zod, repository de guias, `existingIds` e `guides` no repository de atrações.
2. Servidor: `GuidesService` com testes, `guides` no `AttractionsService`.
3. Servidor: rotas, OpenAPI, seed, e2e, README.
4. App turista: serviço, `GuideCards` com links, `AttractionDetails`, remoção do estático.
5. App admin: `Checklist`, `AdminGuides`, `AdminGuideForm`, menu e rotas.
