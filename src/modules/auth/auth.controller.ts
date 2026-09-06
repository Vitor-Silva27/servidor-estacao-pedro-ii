import type { RequestHandler } from "express";
import type { AuthService } from "./auth.service";

export function createAuthController(service: AuthService) {
  const register: RequestHandler = async (req, res) => {
    res.status(201).json(await service.register(req.body));
  };

  const login: RequestHandler = async (req, res) => {
    res.json(await service.login(req.body));
  };

  const refresh: RequestHandler = async (req, res) => {
    res.json(await service.refresh(req.body.refreshToken));
  };

  const logout: RequestHandler = async (req, res) => {
    await service.logout(req.body.refreshToken);
    res.status(204).send();
  };

  const me: RequestHandler = async (req, res) => {
    res.json(await service.me(req.user!.id));
  };

  return { register, login, refresh, logout, me };
}
