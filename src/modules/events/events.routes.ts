import { Router } from "express";
import type { TokenService } from "../auth/token.service";
import { authenticate } from "../../shared/middlewares/authenticate";
import { authorize } from "../../shared/middlewares/authorize";
import { uploadImage } from "../../shared/middlewares/upload";
import { validate } from "../../shared/middlewares/validate";
import { createEventsController } from "./events.controller";
import {
  eventCoverSchema,
  eventIdParamsSchema,
  eventPhotoParamsSchema,
  eventSchema,
} from "./events.schemas";
import type { EventsService } from "./events.service";

export function createEventsRouter(service: EventsService, tokens: TokenService) {
  const router = Router();
  const controller = createEventsController(service);
  const admin = [authenticate(tokens), authorize("ADMIN")];
  const byId = validate({ params: eventIdParamsSchema });
  const body = validate({ body: eventSchema });

  router.get("/", controller.list);
  router.get("/:id", byId, controller.getById);

  router.post("/", ...admin, body, controller.create);
  router.put("/:id", ...admin, byId, body, controller.update);
  router.delete("/:id", ...admin, byId, controller.remove);

  router.post("/:id/photos", ...admin, byId, uploadImage, controller.addPhoto);
  router.delete("/:id/photos/:photoId", ...admin, validate({ params: eventPhotoParamsSchema }), controller.removePhoto);
  router.put("/:id/cover", ...admin, byId, validate({ body: eventCoverSchema }), controller.setCover);

  return router;
}
