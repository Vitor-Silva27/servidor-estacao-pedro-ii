export type GuideSummary = {
  id: string;
  name: string;
  description: string | null;
  whatsapp: string;
  instagram: string | null;
  photoUrl: string | null;
};

type GuideLike = GuideSummary & Record<string, unknown>;

export function toGuideSummary(row: GuideLike): GuideSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    whatsapp: row.whatsapp,
    instagram: row.instagram,
    photoUrl: row.photoUrl,
  };
}
