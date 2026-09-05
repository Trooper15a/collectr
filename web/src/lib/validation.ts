import { z } from "zod";

export const ItemBody = z.object({
  cardId: z.string().min(4),
  quantity: z.coerce.number().int().min(1).max(9999).default(1),
  variantType: z.string().min(1).max(40).default("normal"),
  condition: z.enum(["NM", "LP", "MP", "HP", "DMG"]).default("NM"),
  isGraded: z.boolean().default(false),
  gradingCompany: z.string().max(20).nullable().optional(),
  grade: z.string().max(10).nullable().optional(),
  certNumber: z.string().max(40).nullable().optional(),
  costBasis: z.coerce.number().min(0).nullable().optional(),
  costCurrency: z.enum(["USD", "EUR", "GBP", "CAD", "JPY", "AUD"]).default("USD"),
  notes: z.string().max(2000).nullable().optional(),
});
export type ItemInput = z.infer<typeof ItemBody>;

export const ItemPatch = ItemBody.omit({ cardId: true }).partial();
