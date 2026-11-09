import type { LucideIcon } from "lucide-react";

type PageHeaderProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
};

export function PageHeader({ icon: Icon, title, description, children }: PageHeaderProps) {
  return (
    <header className="shrink-0 border-b border-border px-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl text-foreground">
            <Icon size={18} className="text-faint" aria-hidden="true" />
            {title}
          </h1>
          <p className="mt-1 max-w-lg text-sm leading-relaxed text-subtle">{description}</p>
        </div>
        {children}
      </div>
    </header>
  );
}
