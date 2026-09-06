import { z } from "zod";

export const EVENT_SCOPES = ["upcoming", "all"] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

const optionalText = z.string().trim().min(1).optional();
const isoDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const eventSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(10),
    startsAt: isoDate,
    endsAt: isoDate,
    dateNote: optionalText,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    address: optionalText,
    tips: optionalText,
  })
  .refine((event) => event.endsAt >= event.startsAt, {
    message: "O fim deve ser igual ou depois do início",
    path: ["endsAt"],
  });

export const eventIdParamsSchema = z.object({ id: z.uuid() });
export const eventPhotoParamsSchema = z.object({ id: z.uuid(), photoId: z.uuid() });
export const eventListQuerySchema = z.object({ scope: z.enum(EVENT_SCOPES).default("upcoming") });
export const eventCoverSchema = z.object({ photoId: z.uuid() });

export type EventInput = z.infer<typeof eventSchema>;
