import { z } from "zod/v4";

export const signinEmailSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export type SigninEmailValues = z.infer<typeof signinEmailSchema>;
