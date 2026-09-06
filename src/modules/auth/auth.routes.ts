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
