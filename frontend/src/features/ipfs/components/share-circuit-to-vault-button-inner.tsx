"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Share2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth";
import { PinButton } from "@/features/vault-pinning/components/pin-button";
import { useIpfsUpload } from "../hooks/use-ipfs-upload";
import { getLocalItems } from "../lib/local-index";
import {
  buildCircuitRecord,
  countGatesFromQasm,
  countQubitsFromQasm,
  parseTagsInput,
} from "../lib/circuit-record";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  description: z.string().max(500).optional(),
  tags: z.string().max(200).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface ShareCircuitToVaultButtonInnerProps {
  qasm: string;
  /** Prefill name (e.g. selected template). */
  defaultName?: string;
  className?: string;
}

export function ShareCircuitToVaultButtonInner({
  qasm,
  defaultName = "",
  className,
}: ShareCircuitToVaultButtonInnerProps) {
  const { user } = useAuth();
  const { upload, uploading, ready, heliaStatus } = useIpfsUpload();
  const [open, setOpen] = useState(false);
  const [sharedCid, setSharedCid] = useState<string | null>(null);
  const [publishedName, setPublishedName] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: defaultName,
      description: "",
      tags: "",
    },
  });

  const author =
    user?.name?.trim() ||
    user?.email?.trim() ||
    "anonymous";

  const qasmReady = qasm.trim().length >= 10;
  const qubitCount = countQubitsFromQasm(qasm);
  const gateCount = countGatesFromQasm(qasm);

  const onPublish = form.handleSubmit(async (values) => {
    if (!ready) {
      toast.warning(heliaStatus);
      return;
    }
    try {
      const record = buildCircuitRecord({
        name: values.name,
        description: values.description,
        qasm,
        author,
        tags: parseTagsInput(values.tags ?? ""),
      });
      const cid = await upload(
        record as unknown as Record<string, unknown>,
        record.name,
        "circuit",
      );
      if (!cid) {
        toast.error("Failed to publish circuit to VAULT");
        return;
      }
      setSharedCid(cid);
      setPublishedName(record.name);
      setOpen(false);
      toast.success("Circuit published to VAULT");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed");
    }
  });

  if (sharedCid && publishedName) {
    const existing = getLocalItems().find((i) => i.cid === sharedCid);
    return (
      <PinButton
        cid={sharedCid}
        type="circuit"
        metadata={{
          name: publishedName,
          qubit_count: qubitCount,
          gate_count: gateCount,
          ...(existing?.size ? { size: existing.size } : {}),
        }}
      />
    );
  }

  const isNotReady = !ready && !uploading;

  const trigger = (
    <button
      type="button"
      disabled={!qasmReady || uploading}
      className={cn(
        "group relative inline-flex w-full cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-lg",
        "border px-3 py-2.5",
        "text-[13px] font-semibold transition-all duration-200",
        !qasmReady
          ? "cursor-not-allowed border-white/8 bg-white/[0.03] text-white/30"
          : isNotReady
            ? "border-rose-500/25 bg-rose-500/8 text-rose-400 hover:border-rose-500/50 hover:bg-rose-500/15"
            : "border-cyan-500/25 bg-cyan-500/8 text-cyan-300 hover:border-cyan-500/50 hover:bg-cyan-500/15",
        uploading && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      {uploading ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
      ) : (
        <Share2 className="size-3.5 shrink-0" />
      )}
      <span>{uploading ? "Publishing…" : "Publish circuit to VAULT"}</span>
      {isNotReady && qasmReady ? <XCircle className="size-3.5 shrink-0" /> : null}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
          </TooltipTrigger>
          {!qasmReady ? (
            <TooltipContent>Enter a circuit (at least 10 characters) first</TooltipContent>
          ) : isNotReady ? (
            <TooltipContent className="max-w-56 text-center text-xs">
              {heliaStatus}
            </TooltipContent>
          ) : null}
        </Tooltip>
      </TooltipProvider>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Publish circuit to VAULT</DialogTitle>
          <DialogDescription>
            Stores an OpenQASM record in your local Helia vault ({qubitCount} qubits ·{" "}
            {gateCount} gates). You can pin it afterward for sharing.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onPublish} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="circuit-name" className="text-xs font-medium text-muted-foreground">
              Name
            </label>
            <Input
              id="circuit-name"
              placeholder="Bell state"
              autoComplete="off"
              {...form.register("name")}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="circuit-desc" className="text-xs font-medium text-muted-foreground">
              Description
            </label>
            <Input
              id="circuit-desc"
              placeholder="Optional short description"
              autoComplete="off"
              {...form.register("description")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="circuit-tags" className="text-xs font-medium text-muted-foreground">
              Tags
            </label>
            <Input
              id="circuit-tags"
              placeholder="bell, entanglement (comma-separated)"
              autoComplete="off"
              {...form.register("tags")}
            />
          </div>

          <p className="text-xs text-muted-foreground">Author: {author}</p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading || !ready}>
              {uploading ? "Publishing…" : "Publish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
