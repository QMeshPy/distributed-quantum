"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UI } from "@/constants";
import { useBuyCredits, useCredits, useCreditsReturn } from "../hooks/use-credits";

const NO_COST = "0";

export function CreditsPanel() {
  const pollUntil = useCreditsReturn();
  const { data, isError, isPending } = useCredits(pollUntil);
  const buy = useBuyCredits();
  const stablecoinOffers = data?.offers.filter((offer) => offer.stablecoin) ?? [];

  return (
    <Card className="border-hairline">
      <CardHeader>
        <CardTitle className="text-base font-medium">{UI.CREDITS.TITLE}</CardTitle>
        <CardDescription>{UI.CREDITS.DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isError ? (
          <p className="text-xs text-muted-foreground">{UI.CREDITS.ERROR}</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-base font-medium">
                  {isPending ? UI.CREDITS.BALANCE_LOADING : data.available}
                </span>
                <span className="text-xs text-muted-foreground">
                  {UI.CREDITS.BALANCE_LABEL}
                  {data && Number(data.held) > 0 ? ` · ${data.held} ${UI.CREDITS.HELD_LABEL}` : ""}
                </span>
              </div>
              {data ? (
                <Badge variant="secondary">
                  {data.circuitJobCost === NO_COST
                    ? UI.CREDITS.JOB_COST_FREE
                    : UI.CREDITS.JOB_COST(data.circuitJobCost)}
                </Badge>
              ) : null}
            </div>
            {data && data.offers.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {data.offers.map((offer) => (
                    <Button
                      key={offer.priceId}
                      variant="outline"
                      disabled={buy.isPending}
                      onClick={() => buy.mutate({ priceId: offer.priceId, method: "card" })}
                    >
                      {UI.CREDITS.BUY_CTA(offer.credits, offer.price)}
                    </Button>
                  ))}
                </div>
                {stablecoinOffers.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      {stablecoinOffers.map((offer) => (
                        <Button
                          key={offer.priceId}
                          variant="outline"
                          disabled={buy.isPending}
                          onClick={() => buy.mutate({ priceId: offer.priceId, method: "crypto" })}
                        >
                          {UI.CREDITS.BUY_STABLECOIN_CTA(offer.credits, offer.price)}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{UI.CREDITS.STABLECOIN_NOTE}</p>
                  </div>
                ) : null}
              </>
            ) : data ? (
              <p className="text-xs text-muted-foreground">{UI.CREDITS.UNAVAILABLE}</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
