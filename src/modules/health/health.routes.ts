import { Router } from "express";
import { createHealthController } from "./health.controller";

export function createHealthRouter(deps: Parameters<typeof createHealthController>[0]) {
  const router = Router();
  router.get("/", createHealthController(deps));
  return router;
}
