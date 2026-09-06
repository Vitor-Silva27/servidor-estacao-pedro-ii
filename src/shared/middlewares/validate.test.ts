import type { Request, Response } from "express";
import { z, ZodError } from "zod";
import { validate } from "./validate";

const res = {} as Response;

describe("validate", () => {
  const schema = z.object({ email: z.email(), age: z.coerce.number() });

  it("substitui req.body pelos dados parseados e chama next", () => {
    const req = { body: { email: "a@b.com", age: "30", extra: 1 } } as Request;
    const next = jest.fn();
    validate({ body: schema })(req, res, next);
    expect(req.body).toEqual({ email: "a@b.com", age: 30 });
    expect(next).toHaveBeenCalledWith();
  });

  it("lança ZodError quando o body é inválido", () => {
    const req = { body: { email: "x" } } as Request;
    const next = jest.fn();
    expect(() => validate({ body: schema })(req, res, next)).toThrow(ZodError);
    expect(next).not.toHaveBeenCalled();
  });

  it("valida params quando informado", () => {
    const req = { params: { id: "abc" } } as unknown as Request;
    const next = jest.fn();
    validate({ params: z.object({ id: z.string().min(1) }) })(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });
});
