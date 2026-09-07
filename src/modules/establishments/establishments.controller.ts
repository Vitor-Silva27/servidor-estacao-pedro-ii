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
