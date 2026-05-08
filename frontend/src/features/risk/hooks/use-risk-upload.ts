"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QUERY_KEYS, API } from "@/constants";
import type { BackendRiskSubmitResponse, RiskModel } from "../types";

interface RiskUploadParams {
  file: File;
  riskModel: RiskModel;
}

export function useRiskUpload() {
  const queryClient = useQueryClient();

  return useMutation<BackendRiskSubmitResponse, Error, RiskUploadParams>({
    mutationFn: async ({ file, riskModel }: RiskUploadParams) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("risk_model", riskModel);
      const res = await fetch(API.RISK.CREATE, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(err.detail ?? "Upload failed");
      }
      return res.json() as Promise<BackendRiskSubmitResponse>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.risk.all() });
      toast.success("Risk job submitted");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
