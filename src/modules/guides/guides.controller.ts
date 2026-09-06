import type { RequestHandler } from "express";
import { ValidationError } from "../../shared/errors/AppError";
import { extensionFor } from "../../shared/middlewares/upload";
import type { GuidesService } from "./guides.service";

export function createGuidesController(service: GuidesService) {
  const list: RequestHandler = async (_req, res) => {
    res.json(await service.list());
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

  const setPhoto: RequestHandler = async (req, res) => {
    const file = req.file;
    if (!file) throw new ValidationError([{ path: "file", message: "Arquivo obrigatório" }]);
    const ext = extensionFor(file.mimetype);
    if (!ext) throw new ValidationError([{ path: "file", message: "Formato inválido. Use JPEG, PNG ou WebP" }]);
    res.json(await service.setPhoto(req.params.id as string, { buffer: file.buffer, ext }));
  };

  return { list, getById, create, update, remove, setPhoto };
}
