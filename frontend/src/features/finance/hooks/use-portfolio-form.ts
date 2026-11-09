"use client";
import { useRef, type BaseSyntheticEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { portfolioUploadSchema } from "../schemas/portfolio-upload.schema";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/constants";
import { usePortfolioUpload } from "./use-portfolio-upload";

export function usePortfolioForm() {
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm({
    resolver: zodResolver(portfolioUploadSchema),
    defaultValues: {
      useChainlink: false,
      investmentUsd: 1000,
      expectedEthPrice: 0,
    },
  });
  const useChainlink = useWatch({ control, name: "useChainlink" });
  const { mutate, isPending } = usePortfolioUpload();
  const submit = (event?: BaseSyntheticEvent) =>
    handleSubmit((values) => {
      const file = fileRef.current?.files?.[0];
      if (!file) {
        setError("root", { message: "Choose a CSV file first." });
        return;
      }
      mutate(
        { file, ...values },
        { onSuccess: (data) => router.push(ROUTES.financeDetail(data.job_id)) },
      );
    })(event);
  return { errors, fileRef, register, useChainlink, submit, isPending };
}
