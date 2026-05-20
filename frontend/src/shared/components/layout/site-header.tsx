import { AutoBreadcrumbs } from "./auto-breadcrumbs";
import { NotificationsBell } from "./notifications-bell";

export function SiteHeader() {
  return (
    <header className="flex h-11 items-center border-b px-5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <AutoBreadcrumbs />
      <div className="ml-auto flex items-center">
        <NotificationsBell />
      </div>
    </header>
  );
}
