import { z } from "zod";
import { instagramSchema, whatsappSchema } from "../../shared/contacts";

export const guideSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(1).optional(),
  whatsapp: whatsappSchema,
  instagram: instagramSchema.optional(),
  attractionIds: z
    .array(z.uuid())
    .refine((ids) => new Set(ids).size === ids.length, { message: "Atrações repetidas" }),
});

export const guideIdParamsSchema = z.object({ id: z.uuid() });

export type GuideInput = z.infer<typeof guideSchema>;
