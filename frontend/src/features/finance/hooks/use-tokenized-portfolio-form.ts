"use client";
import { type BaseSyntheticEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/constants";
import {
  createTokenizedPortfolioSchema,
  type TokenizedPortfolioValues,
} from "../schemas/tokenized-portfolio.schema";
import { useTokenizedPortfolio } from "./use-tokenized-portfolio";
import type { TokenizedAssetsResponse } from "../types";

function isoDay(offsetDays: number) {
  return new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export function useTokenizedPortfolioForm(catalog: TokenizedAssetsResponse | undefined) {
  const router = useRouter();
  const today = isoDay(0);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TokenizedPortfolioValues>({
    resolver: zodResolver(
      createTokenizedPortfolioSchema({
        today,
        maxHistoryDays: catalog?.max_history_days ?? 366,
        minWeekdays: catalog?.min_aligned_days ?? 60,
      }),
    ),
    defaultValues: { symbols: [], startDate: isoDay(180), endDate: today },
  });
  const { mutate, isPending } = useTokenizedPortfolio();
  const submit = (event?: BaseSyntheticEvent) =>
    handleSubmit((values) =>
      mutate(
        {
          symbols: values.symbols,
          start_date: values.startDate,
          end_date: values.endDate,
        },
        { onSuccess: (data) => router.push(ROUTES.financeDetail(data.job_id)) },
      ),
    )(event);
  return { errors, register, submit, isPending, today };
}
