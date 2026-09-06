import { Router } from "express";
import type { TokenService } from "../auth/token.service";
import { authenticate } from "../../shared/middlewares/authenticate";
import { authorize } from "../../shared/middlewares/authorize";
import { uploadImage } from "../../shared/middlewares/upload";
import { validate } from "../../shared/middlewares/validate";
import { createGuidesController } from "./guides.controller";
import { guideIdParamsSchema, guideSchema } from "./guides.schemas";
import type { GuidesService } from "./guides.service";

export function createGuidesRouter(service: GuidesService, tokens: TokenService) {
  const router = Router();
  const controller = createGuidesController(service);
  const admin = [authenticate(tokens), authorize("ADMIN")];
  const byId = validate({ params: guideIdParamsSchema });
  const body = validate({ body: guideSchema });

  router.get("/", controller.list);
  router.get("/:id", byId, controller.getById);

  router.post("/", ...admin, body, controller.create);
  router.put("/:id", ...admin, byId, body, controller.update);
  router.delete("/:id", ...admin, byId, controller.remove);
  router.post("/:id/photo", ...admin, byId, uploadImage, controller.setPhoto);

  return router;
}
