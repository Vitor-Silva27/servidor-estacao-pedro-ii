import { Router } from "express";
import type { TokenService } from "../auth/token.service";
import { authenticate } from "../../shared/middlewares/authenticate";
import { authorize } from "../../shared/middlewares/authorize";
import { uploadImage } from "../../shared/middlewares/upload";
import { validate } from "../../shared/middlewares/validate";
import { createAttractionsController } from "./attractions.controller";
import {
  attractionIdParamsSchema,
  createAttractionSchema,
  photoParamsSchema,
  setCoverSchema,
} from "./attractions.schemas";
import type { AttractionsService } from "./attractions.service";

export function createAttractionsRouter(service: AttractionsService, tokens: TokenService) {
  const router = Router();
  const controller = createAttractionsController(service);
  const admin = [authenticate(tokens), authorize("ADMIN")];
  const byId = validate({ params: attractionIdParamsSchema });

  router.get("/", controller.list);
  router.get("/:id", byId, controller.getById);

  router.post("/", ...admin, validate({ body: createAttractionSchema }), controller.create);
  router.put("/:id", ...admin, byId, controller.update);
  router.delete("/:id", ...admin, byId, controller.remove);

  router.post("/:id/photos", ...admin, byId, uploadImage, controller.addPhoto);
  router.delete("/:id/photos/:photoId", ...admin, validate({ params: photoParamsSchema }), controller.removePhoto);
  router.put("/:id/cover", ...admin, byId, validate({ body: setCoverSchema }), controller.setCover);

  return router;
}
