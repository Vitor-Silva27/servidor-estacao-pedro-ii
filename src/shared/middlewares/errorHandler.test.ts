import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { errorHandler } from "./errorHandler";
import { NotFoundError } from "../errors/AppError";
import multer from "multer";
import { ValidationError } from "../errors/AppError";

function mockRes() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const req = {} as Request;
const next = jest.fn() as NextFunction;

describe("errorHandler", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it("mapeia AppError para o status e código dele", () => {
    const res = mockRes();
    errorHandler(new NotFoundError("Usuário não encontrado"), req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "NOT_FOUND", message: "Usuário não encontrado" },
    });
  });

  it("mapeia ZodError para 400 com details", () => {
    const res = mockRes();
    const result = z.object({ email: z.email() }).safeParse({ email: "x" });
    if (result.success) throw new Error("esperava falha");
    errorHandler(result.error, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados inválidos",
        details: [{ path: "email", message: expect.any(String) }],
      },
    });
  });

  it("mapeia erro desconhecido para 500 sem vazar a mensagem", () => {
    const res = mockRes();
    errorHandler(new Error("segredo"), req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" },
    });
  });

  it("inclui details quando o AppError é ValidationError", () => {
    const res = mockRes();
    errorHandler(new ValidationError([{ path: "file", message: "Arquivo obrigatório" }]), req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados inválidos",
        details: [{ path: "file", message: "Arquivo obrigatório" }],
      },
    });
  });

  it("mapeia MulterError de tamanho para 400 no campo file", () => {
    const res = mockRes();
    errorHandler(new multer.MulterError("LIMIT_FILE_SIZE", "file"), req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados inválidos",
        details: [{ path: "file", message: "Arquivo excede o tamanho máximo de 5 MB" }],
      },
    });
  });
});
