import {
  Panel,
  PanelContent,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@/shared/components/panel/panel";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Copy, Plus } from "lucide-react";

const PLACEHOLDER_KEYS = [
  { id: "1", name: "Production key", prefix: "qg_prod_••••••••", createdAt: "2026-04-12" },
  { id: "2", name: "Dev key", prefix: "qg_dev_••••••••", createdAt: "2026-05-01" },
];

export function ApiKeysPanel() {
  return (
    <Panel className="border-border-subtle">
      <PanelHeader>
        <div className="flex items-center justify-between">
          <div>
            <PanelTitle className="text-base font-medium">API Keys</PanelTitle>
            <PanelDescription>Keys for programmatic access to the platform.</PanelDescription>
          </div>
          <Button size="sm" variant="secondary">
            <Plus size={14} />
            New key
          </Button>
        </div>
      </PanelHeader>
      <PanelContent>
        <ul className="flex flex-col divide-y divide-border-subtle">
          {PLACEHOLDER_KEYS.map((key) => (
            <li key={key.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{key.name}</p>
                <p className="mt-0.5 font-mono text-xs text-subtle">{key.prefix}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge outline className="text-xs">{key.createdAt}</Badge>
                <Button variant="ghost" className="h-7 w-7">
                  <Copy size={13} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-subtle">
          Full API key management requires backend support, wired in M13.
        </p>
      </PanelContent>
    </Panel>
  );
}
