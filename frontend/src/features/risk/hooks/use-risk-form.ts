"use client";
import { useRef, type BaseSyntheticEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { riskFormSchema } from "../schemas/risk-request.schema";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/constants";
import { useRiskUpload } from "./use-risk-upload";
import type { RiskModel } from "../types";

export function useRiskForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const { mutate, isPending } = useRiskUpload();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    setError,
    setValue,
  } = useForm({
    resolver: zodResolver(riskFormSchema),
    defaultValues: {
      riskModel: "equity" as RiskModel,
      useChainlink: false,
      quantity: 1,
      expectedEthPrice: 0,
    },
  });
  const riskModel = useWatch({ control, name: "riskModel" });
  const useChainlink = useWatch({ control, name: "useChainlink" });
  const submit = (event?: BaseSyntheticEvent) =>
    handleSubmit((values) => {
      const file = fileRef.current?.files?.[0];
      if (!file) {
        setError("root", { message: "Choose a CSV file first." });
        return;
      }
      mutate(
        {
          file,
          ...values,
          useChainlink: riskModel === "equity" && values.useChainlink,
        },
        {
          onSuccess: (data) => router.push(ROUTES.riskDetail(data.job_id)),
        },
      );
    })(event);
  return {
    errors,
    fileRef,
    riskModel,
    setRiskModel: (model: RiskModel) => {
      setValue("riskModel", model);
      setValue("useChainlink", false);
    },
    register,
    useChainlink,
    submit,
    isPending,
  };
}
