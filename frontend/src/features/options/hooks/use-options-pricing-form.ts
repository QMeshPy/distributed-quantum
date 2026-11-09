"use client";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { readApiError } from "@/shared/lib/api-error";
import { ROUTES, API, QUERY_KEYS } from "@/constants";
import {
  optionsRequestSchema,
  type OptionsRequestFormValues,
} from "../schemas/options-request.schema";

export function useOptionsPricingForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<OptionsRequestFormValues>({
    resolver: zodResolver(optionsRequestSchema),
    defaultValues: {
      volatility: 0.2,
      risk_free_rate: 0.05,
      time_to_expiry: 1,
    },
  });

  const optionType = useWatch({ control, name: "option_type" });
  const liveFeed = useWatch({ control, name: "chainlink_price" }) !== undefined;
  const supportsFeed =
    optionType === "european_call_short" || optionType === "european_call_long";

  const queryClient = useQueryClient();
  const submission = useMutation({
    mutationFn: async (values: OptionsRequestFormValues) => {
      const response = await fetch(API.OPTIONS.CREATE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok)
        throw new Error(
          await readApiError(response, "Failed to submit options job"),
        );
      return response.json() as Promise<{ job_id: string }>;
    },
    onSuccess: (job) => {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.options.all(),
      });
      toast.success("Options job submitted");
      router.push(ROUTES.optionsDetail(job.job_id));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function selectOption(value: OptionsRequestFormValues["option_type"]) {
    setValue("option_type", value, { shouldValidate: true });
    if (value !== "european_call_short" && value !== "european_call_long")
      setValue("chainlink_price", undefined);
  }
  function setLiveFeed(enabled: boolean) {
    setValue(
      "chainlink_price",
      enabled ? { network: "ethereum-sepolia", feed: "eth-usd" } : undefined,
    );
  }
  return {
    register,
    submit: handleSubmit((values) => submission.mutate(values)),
    errors,
    isSubmitting: submission.isPending,
    liveFeed,
    supportsFeed,
    selectOption,
    setLiveFeed,
  };
}
