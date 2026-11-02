import { z } from "zod/v4";

// Mirrors the backend's request checks so the form can explain them before submitting.
const DAY_MS = 86_400_000;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");

export interface TokenizedPortfolioLimits {
  today: string;
  maxHistoryDays: number;
  minWeekdays: number;
}

function weekdaysBetween(start: number, end: number) {
  let count = 0;
  for (let day = start; day <= end; day += DAY_MS) {
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

export function createTokenizedPortfolioSchema(limits: TokenizedPortfolioLimits) {
  return z
    .object({
      symbols: z.array(z.string()).min(2, "Select at least two assets."),
      startDate: isoDate,
      endDate: isoDate,
    })
    .superRefine((values, context) => {
      const start = Date.parse(values.startDate);
      const end = Date.parse(values.endDate);
      if (Number.isNaN(start) || Number.isNaN(end)) return;
      const issue = (path: "startDate" | "endDate", message: string) =>
        context.addIssue({ code: "custom", path: [path], message });
      if (values.endDate > limits.today) {
        issue("endDate", "End date cannot be in the future.");
      }
      if (start > end) {
        issue("endDate", "End date must be on or after the start date.");
      } else if ((end - start) / DAY_MS > limits.maxHistoryDays) {
        issue("startDate", `Choose a range of at most ${limits.maxHistoryDays} days.`);
      } else if (weekdaysBetween(start, end) < limits.minWeekdays) {
        issue("startDate", `Choose a range with at least ${limits.minWeekdays} weekdays.`);
      }
    });
}

export type TokenizedPortfolioValues = z.infer<
  ReturnType<typeof createTokenizedPortfolioSchema>
>;
