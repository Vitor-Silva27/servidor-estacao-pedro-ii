import { z } from "zod";
import { NotFoundError } from "../errors/AppError";
import type { Storage } from "../storage/storage";

export type PhotoRow = { id: string; url: string; credit: string | null; position: number };

export type PhotoOwner = { id: string; coverPhotoId: string | null; photos: PhotoRow[] };

export type PhotoRepository = {
  addPhoto(ownerId: string, url: string, credit: string | null): Promise<PhotoRow>;
  updatePhotoCredit(photoId: string, credit: string | null): Promise<PhotoRow>;
  deletePhoto(photoId: string): Promise<void>;
  setCover(ownerId: string, photoId: string | null): Promise<unknown>;
};

export type PhotoInput = { buffer: Buffer; ext: string; credit?: string | null };

/** Crédito/fonte da foto (quem tirou). Texto vazio ou só espaços vira null. */
const creditText = z.string().trim().max(120);
const toCredit = (value: string | null | undefined) => value || null;

/** Campos de texto do multipart do upload, além do arquivo. O crédito é opcional. */
export const photoUploadBodySchema = z.object({ credit: creditText.nullish().transform(toCredit) });
/** No PATCH o campo é obrigatório, para um corpo vazio não apagar o crédito sem querer; null limpa. */
export const updatePhotoSchema = z.strictObject({ credit: creditText.nullable().transform(toCredit) });

function toRow(photo: PhotoRow): PhotoRow {
  return { id: photo.id, url: photo.url, credit: photo.credit, position: photo.position };
}

/**
 * Regras de galeria com capa, independentes de quem é o dono (atração, evento...).
 * `dirFor` diz em que pasta do storage as fotos daquele dono ficam.
 */
export function createPhotoManager(
  repo: PhotoRepository,
  storage: Storage,
  dirFor: (ownerId: string) => string,
) {
  return {
    async add(owner: PhotoOwner, photo: PhotoInput): Promise<PhotoRow> {
      const url = await storage.save(dirFor(owner.id), photo.ext, photo.buffer);
      const created = await repo.addPhoto(owner.id, url, photo.credit ?? null);
      if (!owner.coverPhotoId) {
        await repo.setCover(owner.id, created.id);
      }
      return toRow(created);
    },

    async setCredit(owner: PhotoOwner, photoId: string, credit: string | null): Promise<PhotoRow> {
      if (!owner.photos.some((p) => p.id === photoId)) {
        throw new NotFoundError("Foto não encontrada");
      }
      return toRow(await repo.updatePhotoCredit(photoId, credit));
    },

    async remove(owner: PhotoOwner, photoId: string): Promise<void> {
      const photo = owner.photos.find((p) => p.id === photoId);
      if (!photo) throw new NotFoundError("Foto não encontrada");

      if (owner.coverPhotoId === photoId) {
        const next = owner.photos.find((p) => p.id !== photoId);
        await repo.setCover(owner.id, next?.id ?? null);
      }
      await repo.deletePhoto(photoId);
      await storage.remove(photo.url);
    },

    async setCover(owner: PhotoOwner, photoId: string): Promise<void> {
      if (!owner.photos.some((p) => p.id === photoId)) {
        throw new NotFoundError("Foto não encontrada");
      }
      await repo.setCover(owner.id, photoId);
    },

    removeAll(ownerId: string): Promise<void> {
      return storage.removeDir(dirFor(ownerId));
    },
  };
}

export type PhotoManager = ReturnType<typeof createPhotoManager>;
