"use client";

import { useState } from "react";
import { useCreateProposal } from "../hooks/use-proposals";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
      <DialogContent className="border-white/10 bg-background sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">New Proposal</DialogTitle>
          <div className="flex gap-1 pt-2">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= step ? "bg-violet-500" : "bg-white/10"
                }`}
              />
            ))}
          </div>
          <p className="text-sm text-white/60">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <label className="text-sm text-white/60">Title</label>
                <Input
                  placeholder="Research proposal title"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  className="border-white/10 bg-white/[0.025] text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-white/60">Description</label>
                <Textarea
                  placeholder="What is this research about?"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  className="border-white/10 bg-white/[0.025] text-white"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-white/60">Methodology</label>
                <Textarea
                  placeholder="Describe the approach"
                  value={form.methodology}
                  onChange={(e) => set("methodology", e.target.value)}
                  className="border-white/10 bg-white/[0.025] text-white"
                  rows={2}
                />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <label className="text-sm text-white/60">Budget Required (USDC)</label>
                <Input
                  placeholder="500.00"
                  value={form.budget_required}
                  onChange={(e) => set("budget_required", e.target.value)}
                  className="border-white/10 bg-white/[0.025] text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-white/60">Tags</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add tag"
                    value={form.tagInput}
                    onChange={(e) => set("tagInput", e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                    className="border-white/10 bg-white/[0.025] text-white"
                  />
                  <Button type="button" variant="outline" onClick={addTag} className="border-white/10">
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {form.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="bg-violet-500/10 text-violet-400">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="ml-1">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
                <div>
                  <p className="text-sm text-white">Auto-fragment</p>
                  <p className="text-xs text-white/40">
                    Automatically split budget into claimable fragments
                  </p>
                </div>
                <Switch
                  checked={form.auto_fragment}
                  onCheckedChange={(v) => set("auto_fragment", v)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-white/60">Deadline (days)</label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={form.deadline_days}
                  onChange={(e) => set("deadline_days", parseInt(e.target.value) || 30)}
                  className="border-white/10 bg-white/[0.025] text-white"
                />
              </div>
            </>
          )}

          {step === 3 && (
            <div className="space-y-3 rounded-lg border border-white/10 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Title</span>
                <span className="text-white">{form.title}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Budget</span>
                <span className="text-white">{form.budget_required} USDC</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Deadline</span>
                <span className="text-white">{form.deadline_days} days</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Auto-fragment</span>
                <span className="text-white">{form.auto_fragment ? "Yes" : "No"}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {form.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="bg-violet-500/10 text-violet-400">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="text-white/60"
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 0 && !form.title.trim()}
              className="bg-violet-600 hover:bg-violet-700"
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={create.isPending}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {create.isPending ? "Creating…" : "Create Proposal"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
