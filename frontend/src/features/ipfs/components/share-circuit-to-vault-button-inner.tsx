"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Share2, XCircle } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
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
    <Button
      type="button"
      variant={isNotReady && qasmReady ? "danger" : "secondary"}
      disabled={!qasmReady || uploading}
      loading={uploading}
      className={cn("w-full", className)}
    >
      {uploading ? null : <Share2 className="size-3.5 shrink-0" />}
      <span>{uploading ? "Publishing…" : "Publish circuit to VAULT"}</span>
      {isNotReady && qasmReady ? <XCircle className="size-3.5 shrink-0" /> : null}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip
        content={!qasmReady ? "Enter a circuit (at least 10 characters) first" : isNotReady ? heliaStatus : null}
      >
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      </Tooltip>

      <DialogContent title="Publish circuit to VAULT" description={`Stores an OpenQASM record in your local Helia vault (${qubitCount} qubits · ${gateCount} gates). You can pin it afterward for sharing.`}>

        <form onSubmit={onPublish} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="circuit-name" className="text-xs font-medium text-subtle">
              Name
            </label>
            <Input
              id="circuit-name"
              label="Bell state" placeholder="Bell state"
              autoComplete="off"
              {...form.register("name")}
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-danger">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="circuit-desc" className="text-xs font-medium text-subtle">
              Description
            </label>
            <Input
              id="circuit-desc"
              label="Optional short description" placeholder="Optional short description"
              autoComplete="off"
              {...form.register("description")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="circuit-tags" className="text-xs font-medium text-subtle">
              Tags
            </label>
            <Input
              id="circuit-tags"
              label="bell, entanglement (comma-separated)" placeholder="bell, entanglement (comma-separated)"
              autoComplete="off"
              {...form.register("tags")}
            />
          </div>

          <p className="text-xs text-subtle">Author: {author}</p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={uploading || !ready}>
              {uploading ? "Publishing…" : "Publish"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
