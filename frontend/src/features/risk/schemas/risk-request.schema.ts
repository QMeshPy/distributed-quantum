import { z } from "zod/v4";

export const riskUploadSchema = z.object({
  risk_model: z.enum(["equity", "credit"]),
});

export type RiskUploadFormValues = z.infer<typeof riskUploadSchema>;
