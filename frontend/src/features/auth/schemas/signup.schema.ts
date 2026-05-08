import { z } from "zod/v4";

export const signupSchema = z.object({
  email: z.email("Enter a valid email address"),
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  organization: z.string().optional(),
});

export type SignupValues = z.infer<typeof signupSchema>;
