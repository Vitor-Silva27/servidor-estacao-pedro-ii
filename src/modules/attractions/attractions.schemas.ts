import { z } from "zod";

export const ATTRACTION_TYPES = ["CACHOEIRA", "PONTO_TURISTICO"] as const;
export const TRAIL_LEVELS = ["FACIL", "MEDIA", "DIFICIL"] as const;

export type AttractionType = (typeof ATTRACTION_TYPES)[number];
export type TrailLevel = (typeof TRAIL_LEVELS)[number];

const optionalText = z.string().trim().min(1).optional();

const baseFields = {
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  tips: optionalText,
  howToGet: optionalText,
};

const trailFields = {
  trailDistance: z.string().trim().min(1),
  trailTime: z.string().trim().min(1),
  trailLevel: z.enum(TRAIL_LEVELS),
};

const placeFields = {
  openingHours: optionalText,
  price: optionalText,
};

// strictObject rejeita chaves desconhecidas: campos de trilha num ponto turístico (e vice-versa) dão 400.
export const waterfallFieldsSchema = z.strictObject({ ...baseFields, ...trailFields });
export const placeFieldsSchema = z.strictObject({ ...baseFields, ...placeFields });

export const createAttractionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("CACHOEIRA"), ...baseFields, ...trailFields }),
  z.strictObject({ type: z.literal("PONTO_TURISTICO"), ...baseFields, ...placeFields }),
]);

export function fieldsSchemaFor(type: AttractionType) {
  return type === "CACHOEIRA" ? waterfallFieldsSchema : placeFieldsSchema;
}

export const attractionIdParamsSchema = z.object({ id: z.uuid() });
export const photoParamsSchema = z.object({ id: z.uuid(), photoId: z.uuid() });
export const listQuerySchema = z.object({ type: z.enum(ATTRACTION_TYPES).optional() });
export const setCoverSchema = z.object({ photoId: z.uuid() });

export type CreateAttractionInput = z.infer<typeof createAttractionSchema>;
export type AttractionFields = z.infer<typeof waterfallFieldsSchema> | z.infer<typeof placeFieldsSchema>;
