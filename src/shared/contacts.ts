import { z } from "zod";

const WHATSAPP_MESSAGE = "Informe DDI, DDD e número, ex.: 55 86 99999-0000";
const INSTAGRAM_MESSAGE = "Use só letras, números, ponto e sublinhado";

/** Mantém só dígitos: "+55 (86) 99999-0000" → "5586999990000". */
export const normalizeWhatsapp = (value: string) => value.replace(/\D/g, "");

/** Remove @ e espaços: "@Joao.Lucas " → "Joao.Lucas". */
export const normalizeInstagram = (value: string) => value.replace(/[@\s]/g, "");

/** WhatsApp com DDI: 12 ou 13 dígitos depois de normalizar. */
export const whatsappSchema = z
  .string()
  .transform(normalizeWhatsapp)
  .refine((digits) => digits.length === 12 || digits.length === 13, { message: WHATSAPP_MESSAGE });

/** Handle do Instagram sem @: letras, números, ponto e sublinhado, 1 a 30 caracteres. */
export const instagramSchema = z
  .string()
  .transform(normalizeInstagram)
  .pipe(z.string().regex(/^[A-Za-z0-9._]{1,30}$/, { message: INSTAGRAM_MESSAGE }));
