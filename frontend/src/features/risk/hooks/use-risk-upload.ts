"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { readApiError } from "@/shared/lib/api-error";
import { QUERY_KEYS, API } from "@/constants";
import type { BackendRiskSubmitResponse, RiskModel } from "../types";

interface RiskUploadParams {
  file: File;
  riskModel: RiskModel;
  useChainlink?: boolean;
  quantity?: number;
  expectedEthPrice?: number;
}

export function useRiskUpload() {
  const queryClient = useQueryClient();

  return useMutation<BackendRiskSubmitResponse, Error, RiskUploadParams>({
    mutationFn: async ({
      file,
      riskModel,
      useChainlink,
      quantity,
      expectedEthPrice,
    }: RiskUploadParams) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("risk_model", riskModel);
      if (useChainlink) {
        formData.append("use_chainlink", "true");
        formData.append("quantity", String(quantity));
        formData.append("current_value", String(expectedEthPrice));
      }
      const res = await fetch(API.RISK.CREATE, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Upload failed"));
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
