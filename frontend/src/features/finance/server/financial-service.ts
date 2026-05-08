import "server-only";
import { cache } from "react";
import { BACKEND } from "@/constants";
import type {
  BackendFinancialJobResponse,
  BackendFinancialJobSummary,
  FinanceJobDetail,
  FinanceJobSummary,
} from "../types";

function transformSummary(raw: BackendFinancialJobSummary): FinanceJobSummary {
  return {
    jobId: raw.job_id,
    filename: raw.filename,
    problemType: raw.problem_type,
    status: raw.status,
    rowCount: raw.row_count,
    colCount: raw.col_count,
    error: raw.error,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function transformDetail(raw: BackendFinancialJobResponse): FinanceJobDetail {
  return {
    jobId: raw.job_id,
    filename: raw.filename,
    problemType: raw.problem_type,
    status: raw.status,
    rowCount: raw.row_count,
    colCount: raw.col_count,
    error: raw.error,
    result: raw.result,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export const getFinanceList = cache(
  async (): Promise<FinanceJobSummary[] | null> => {
    try {
      const res = await fetch(BACKEND.FINANCE.LIST, {
        next: { revalidate: 30 },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as BackendFinancialJobSummary[];
      return data.map(transformSummary);
    } catch {
      return null;
    }
  },
);

export const getFinanceJob = cache(
  async (jobId: string): Promise<FinanceJobDetail | null> => {
    try {
      const res = await fetch(BACKEND.FINANCE.DETAIL(jobId), {
        next: { revalidate: 5 },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as BackendFinancialJobResponse;
      return transformDetail(data);
    } catch {
      return null;
    }
  },
);
