"use client";

import { useEffect } from "react";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { registerToast } from "@/shared/lib/toast";

export function ToastBridge() {
  const { toast } = useToastStack();
  useEffect(() => {
    registerToast(toast);
    return () => registerToast(null);
  }, [toast]);
  return null;
}
