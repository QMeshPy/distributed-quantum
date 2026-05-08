"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/constants";
import { useRiskUpload } from "../hooks/use-risk-upload";
import type { RiskModel } from "../types";

interface RiskUploadPanelProps {
  className?: string;
}

export function RiskUploadPanel({ className }: RiskUploadPanelProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [riskModel, setRiskModel] = useState<RiskModel>("equity");
  const { mutate, isPending } = useRiskUpload();

  function handleSubmit() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    mutate(
      { file, riskModel },
      {
        onSuccess: (data) => {
          router.push(ROUTES.riskDetail(data.job_id));
        },
      },
    );
  }

  return (
    <Card className={cn("border-hairline bg-surface-soft", className)}>
      <CardHeader className="pb-2">
        <h2 className="text-base font-medium text-foreground">
          Upload Portfolio
        </h2>
        <p className="text-xs text-muted-foreground">
          Upload a CSV with your portfolio holdings to run quantum risk analysis.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="risk_model">Risk Model</Label>
          <Select
            value={riskModel}
            onValueChange={(v) => setRiskModel(v as RiskModel)}
          >
            <SelectTrigger id="risk_model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="equity">Equity VaR</SelectItem>
              <SelectItem value="credit">Credit VaR</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="portfolio_csv">Portfolio CSV</Label>
          <input
            id="portfolio_csv"
            ref={fileRef}
            type="file"
            accept=".csv"
            className="block w-full text-sm text-foreground file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1 file:text-xs file:font-medium file:text-foreground"
          />
          <p className="text-xs text-muted-foreground">
            Equity: columns ticker, weight &nbsp;|&nbsp; Credit: loan_id,
            principal, default_probability, recovery_rate, sensitivity_rho,
            sector
          </p>
        </div>

        <Button onClick={handleSubmit} disabled={isPending} className="w-full">
          {isPending ? "Submitting…" : "Run Risk Analysis"}
        </Button>
      </CardContent>
    </Card>
  );
}
