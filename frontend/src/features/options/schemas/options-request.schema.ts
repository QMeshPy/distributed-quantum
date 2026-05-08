import { z } from "zod/v4";

export const optionsRequestSchema = z.object({
  option_type: z.enum([
    "european_call_short",
    "european_call_long",
    "expand",
    "delay",
    "abandon",
    "patent",
    "natural_resource",
    "financial_flexibility",
  ]),
  current_value: z.number().positive(),
  strike_or_cost: z.number().positive(),
  time_to_expiry: z.number().positive(),
  volatility: z.number().min(0).max(5),
  risk_free_rate: z.number(),
  dividend_per_share: z.number().optional(),
  days_to_ex_dividend: z.number().optional(),
  annual_cost_of_delay: z.number().optional(),
  reserve_quantity: z.number().optional(),
  resource_price_per_unit: z.number().optional(),
  extraction_cost_per_unit: z.number().optional(),
  annual_cashflow_after_tax: z.number().optional(),
  reinvestment_need_pct: z.number().optional(),
  reinvestment_volatility: z.number().optional(),
  max_internal_financing_pct: z.number().optional(),
  cost_of_capital: z.number().optional(),
  return_on_capital: z.number().optional(),
  num_uncertainty_qubits: z.number().int().positive().optional(),
  epsilon: z.number().optional(),
  alpha: z.number().optional(),
});

export type OptionsRequestFormValues = z.infer<typeof optionsRequestSchema>;
