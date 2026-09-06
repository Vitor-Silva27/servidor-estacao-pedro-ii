import { z } from "zod";

const WHATSAPP_MESSAGE = "Informe DDI, DDD e número, ex.: 55 86 99999-0000";
const INSTAGRAM_MESSAGE = "Use só letras, números, ponto e sublinhado";

/** Mantém só dígitos: "+55 (86) 99999-0000" → "5586999990000". */
export const normalizeWhatsapp = (value: string) => value.replace(/\D/g, "");

/** Remove @ e espaços: "@Joao.Lucas " → "Joao.Lucas". */
export const normalizeInstagram = (value: string) => value.replace(/[@\s]/g, "");

export const guideSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).optional(),
  whatsapp: z
    .string()
    .transform(normalizeWhatsapp)
    .refine((digits) => digits.length === 12 || digits.length === 13, { message: WHATSAPP_MESSAGE }),
  instagram: z
    .string()
    .transform(normalizeInstagram)
    .pipe(z.string().regex(/^[A-Za-z0-9._]{1,30}$/, { message: INSTAGRAM_MESSAGE }))
    .optional(),
  attractionIds: z
    .array(z.uuid())
    .refine((ids) => new Set(ids).size === ids.length, { message: "Atrações repetidas" }),
});

export const guideIdParamsSchema = z.object({ id: z.uuid() });

export type GuideInput = z.infer<typeof guideSchema>;
