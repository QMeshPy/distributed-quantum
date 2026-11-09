"use client";

import { useState } from "react";
import { useCreateProposal } from "../hooks/use-proposals";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Textarea } from "@/components/arc/textarea/textarea";
import { Switch } from "@/components/arc/switch/switch";
import { Badge } from "@/components/arc/badge/badge";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const STEPS = ["Basics", "Budget & Tags", "Options", "Review"] as const;

type FormState = {
  title: string;
  description: string;
  methodology: string;
  budget_required: string;
  tagInput: string;
  tags: string[];
  auto_fragment: boolean;
  deadline_days: number;
};

const EMPTY: FormState = {
  title: "",
  description: "",
  methodology: "",
  budget_required: "",
  tagInput: "",
  tags: [],
  auto_fragment: false,
  deadline_days: 30,
};

export function ProposalCreateDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const create = useCreateProposal();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const addTag = () => {
    const tag = form.tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      set("tags", [...form.tags, tag]);
    }
    set("tagInput", "");
  };

  const removeTag = (tag: string) =>
    set("tags", form.tags.filter((t) => t !== tag));

  const handleSubmit = () => {
    create.mutate(
      {
        title: form.title,
        description: form.description,
        methodology: form.methodology,
        budget_required: form.budget_required,
        tags: form.tags,
        auto_fragment: form.auto_fragment,
        deadline_days: form.deadline_days,
      },
      {
        onSuccess: () => {
          setForm(EMPTY);
          setStep(0);
          onOpenChange(false);
        },
      }
    );
  };

  const handleClose = () => {
    setForm(EMPTY);
    setStep(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent title="New Proposal">
        <div>
<div className="flex gap-1 pt-2">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= step ?"bg-accent" : "bg-surface-raised"
                }`}
              />
            ))}
          </div>
          <p className="text-sm text-subtle">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </p>
        </div>

        <div className="space-y-4 py-2">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <label className="text-sm text-subtle">Title</label>
                <Input
                  label="Research proposal title" placeholder="Research proposal title"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  className="border-border bg-surface-muted text-foreground"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-subtle">Description</label>
                <Textarea
                  label="What is this research about?" placeholder="What is this research about?"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  className="border-border bg-surface-muted text-foreground"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-subtle">Methodology</label>
                <Textarea
                  label="Describe the approach" placeholder="Describe the approach"
                  value={form.methodology}
                  onChange={(e) => set("methodology", e.target.value)}
                  className="border-border bg-surface-muted text-foreground"
                  rows={2}
                />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <label className="text-sm text-subtle">Budget Required (USDC)</label>
                <Input
                  label="500.00" placeholder="500.00"
                  value={form.budget_required}
                  onChange={(e) => set("budget_required", e.target.value)}
                  className="border-border bg-surface-muted text-foreground"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-subtle">Tags</label>
                <div className="flex gap-2">
                  <Input
                    label="Add tag" placeholder="Add tag"
                    value={form.tagInput}
                    onChange={(e) => set("tagInput", e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                    className="border-border bg-surface-muted text-foreground"
                  />
                  <Button type="button" variant="secondary" onClick={addTag} className="border-border">
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {form.tags.map((tag) => (
                    <Badge key={tag}  className="bg-accent/10 text-accent">
                      {tag}
                      <Button variant="ghost" size="sm" onClick={() => removeTag(tag)} className="ml-1">
                        <X className="h-2.5 w-2.5" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm text-foreground">Auto-fragment</p>
                  <p className="text-xs text-subtle">
                    Automatically split budget into claimable fragments
                  </p>
                </div>
                <Switch
                  checked={form.auto_fragment}
                  onCheckedChange={(v) => set("auto_fragment", v)}
                />
              </div>
              <div className="space-y-2">
                <Input
                  label="Deadline (days)"
                  type="number"
                  min={1}
                  max={365}
                  value={form.deadline_days}
                  onChange={(e) => set("deadline_days", parseInt(e.target.value) || 30)}
                  className="border-border bg-surface-muted text-foreground"
                />
              </div>
            </>
          )}

          {step === 3 && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex justify-between text-sm">
                <span className="text-subtle">Title</span>
                <span className="text-foreground">{form.title}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-subtle">Budget</span>
                <span className="text-foreground">{form.budget_required} USDC</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-subtle">Deadline</span>
                <span className="text-foreground">{form.deadline_days} days</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-subtle">Auto-fragment</span>
                <span className="text-foreground">{form.auto_fragment ? "Yes" : "No"}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {form.tags.map((tag) => (
                  <Badge key={tag}  className="bg-accent/10 text-accent">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="text-subtle"
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 0 && !form.title.trim()}
              className="bg-accent hover:bg-accent"
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={create.isPending}
              className="bg-accent hover:bg-accent"
            >
              {create.isPending ? "Creating…" : "Create Proposal"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
