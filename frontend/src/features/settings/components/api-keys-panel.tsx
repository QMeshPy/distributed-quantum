import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Plus } from "lucide-react";

const PLACEHOLDER_KEYS = [
  { id: "1", name: "Production key", prefix: "qg_prod_••••••••", createdAt: "2026-04-12" },
  { id: "2", name: "Dev key", prefix: "qg_dev_••••••••", createdAt: "2026-05-01" },
];

export function ApiKeysPanel() {
  return (
    <Card className="border-hairline">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-medium">API Keys</CardTitle>
            <CardDescription>Keys for programmatic access to the platform.</CardDescription>
          </div>
          <Button size="sm" variant="outline">
            <Plus size={14} />
            New key
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-hairline">
          {PLACEHOLDER_KEYS.map((key) => (
            <li key={key.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{key.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{key.prefix}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{key.createdAt}</Badge>
                <Button size="icon" variant="ghost" className="h-7 w-7">
                  <Copy size={13} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Full API key management requires backend support — wired in M13.
        </p>
      </CardContent>
    </Card>
  );
}
