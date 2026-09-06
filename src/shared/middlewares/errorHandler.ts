import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AppError, ValidationError, type ValidationDetail } from "../errors/AppError";

const MULTER_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: "Arquivo excede o tamanho máximo de 5 MB",
  LIMIT_UNEXPECTED_FILE: "Envie o arquivo no campo 'file'",
};

function sendValidation(res: Response, details: ValidationDetail[], message = "Dados inválidos") {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message, details } });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    sendValidation(
      res,
      err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
    return;
  }

  if (err instanceof multer.MulterError) {
    sendValidation(res, [{ path: "file", message: MULTER_MESSAGES[err.code] ?? err.message }]);
    return;
  }

  if (err instanceof ValidationError) {
    sendValidation(res, err.details, err.message);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" },
  });
}
