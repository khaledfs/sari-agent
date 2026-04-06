import { z } from "zod";

export const assistantActionSchema = z.enum(["add", "update", "remove"]);

export const parsedCartCommandSchema = z.object({
  action: assistantActionSchema,
  productQuery: z.string().trim().min(1, "productQuery is required."),
  quantity: z.number().int().nullable(),
});

export type AssistantAction = z.infer<typeof assistantActionSchema>;
export type ParsedCartCommand = z.infer<typeof parsedCartCommandSchema>;

