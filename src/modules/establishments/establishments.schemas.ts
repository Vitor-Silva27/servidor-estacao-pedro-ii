import { z } from "zod";
import { instagramSchema, whatsappSchema } from "../../shared/contacts";

export const ESTABLISHMENT_TYPES = ["HOSPEDAGEM", "RESTAURANTE"] as const;
export const PRICE_RANGES = ["BAIXO", "MEDIO", "ALTO"] as const;

export type EstablishmentType = (typeof ESTABLISHMENT_TYPES)[number];
export type PriceRange = (typeof PRICE_RANGES)[number];

const optionalText = z.string().trim().min(1).optional();

export const establishmentFieldsSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().trim().min(3),
  whatsapp: whatsappSchema,
  instagram: instagramSchema.optional(),
  openingHours: optionalText,
  priceRange: z.enum(PRICE_RANGES),
  highlights: optionalText,
});

export const createEstablishmentSchema = establishmentFieldsSchema.extend({
  type: z.enum(ESTABLISHMENT_TYPES),
});

export const establishmentIdParamsSchema = z.object({ id: z.uuid() });
export const establishmentPhotoParamsSchema = z.object({ id: z.uuid(), photoId: z.uuid() });
export const establishmentListQuerySchema = z.object({ type: z.enum(ESTABLISHMENT_TYPES).optional() });
export const establishmentCoverSchema = z.object({ photoId: z.uuid() });

export type EstablishmentFields = z.infer<typeof establishmentFieldsSchema>;
export type CreateEstablishmentInput = z.infer<typeof createEstablishmentSchema>;
