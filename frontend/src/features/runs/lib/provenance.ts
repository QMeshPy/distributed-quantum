import { z } from "zod";

export const verificationReportSchema = z.object({
  bundle_id: z.string(),
  status: z.enum(["verified", "partially_verified", "unverified"]),
  checked_at: z.string(),
  checks: z.array(z.object({
    kind: z.enum(["hash", "storage", "anchor"]),
    name: z.string(),
    status: z.enum(["passed", "failed", "unavailable", "not_applicable"]),
    message: z.string(),
    reference: z.string().nullable(),
    url: z.string().nullable(),
  })),
});

export type VerificationReport = z.infer<typeof verificationReportSchema>;

export function safeEvidenceUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) {
      return url.href;
    }
  } catch {
    // Evidence metadata is untrusted; an invalid link must never become clickable.
  }
  return undefined;
}
