import type { ToastOptions } from "@/components/arc/toast-stack/toast-stack";

type Push = (options: ToastOptions) => string;
let push: Push | null = null;

/** Called by ToastBridge once the Arc toast stack is mounted. */
export function registerToast(fn: Push | null) {
  push = fn;
}

type Extra = Partial<Pick<ToastOptions, "description" | "duration" | "id">>;
const make = (type: ToastOptions["type"]) => (title: string, extra?: Extra) => push?.({ type, title, ...extra });

// Imperative facade over Arc's hook-based toast stack, so non-component code can still raise toasts.
export const toast = {
  success: make("success"),
  error: make("error"),
  info: make("info"),
  warning: make("warning"),
};
