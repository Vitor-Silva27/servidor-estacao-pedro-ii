import { Router } from "express";
import type { TokenService } from "../auth/token.service";
import { authenticate } from "../../shared/middlewares/authenticate";
import { authorize } from "../../shared/middlewares/authorize";
import { uploadImage } from "../../shared/middlewares/upload";
import { validate } from "../../shared/middlewares/validate";
import { createEstablishmentsController } from "./establishments.controller";
import {
  createEstablishmentSchema,
  establishmentCoverSchema,
  establishmentFieldsSchema,
  establishmentIdParamsSchema,
  establishmentPhotoParamsSchema,
} from "./establishments.schemas";
import type { EstablishmentsService } from "./establishments.service";

export function createEstablishmentsRouter(service: EstablishmentsService, tokens: TokenService) {
  const router = Router();
  const controller = createEstablishmentsController(service);
  const admin = [authenticate(tokens), authorize("ADMIN")];
  const byId = validate({ params: establishmentIdParamsSchema });

  router.get("/", controller.list);
  router.get("/:id", byId, controller.getById);

  router.post("/", ...admin, validate({ body: createEstablishmentSchema }), controller.create);
  router.put("/:id", ...admin, byId, validate({ body: establishmentFieldsSchema }), controller.update);
  router.delete("/:id", ...admin, byId, controller.remove);

  router.post("/:id/photos", ...admin, byId, uploadImage, controller.addPhoto);
  router.delete("/:id/photos/:photoId", ...admin, validate({ params: establishmentPhotoParamsSchema }), controller.removePhoto);
  router.put("/:id/cover", ...admin, byId, validate({ body: establishmentCoverSchema }), controller.setCover);

  return router;
}
