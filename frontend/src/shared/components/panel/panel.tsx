import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import styles from "./panel.module.css";

// Plain content container on Arc tokens: Arc's own Card is for browsable items, not dashboard panels.
type P = ComponentProps<"div">;
export const Panel = ({ className, ...p }: P) => <div className={cn(styles.panel, className)} {...p} />;
export const PanelHeader = ({ className, ...p }: P) => <div className={cn(styles.header, className)} {...p} />;
export const PanelTitle = ({ className, ...p }: P) => <div className={cn(styles.title, className)} {...p} />;
export const PanelDescription = ({ className, ...p }: P) => <div className={cn(styles.description, className)} {...p} />;
export const PanelContent = ({ className, ...p }: P) => <div className={cn(styles.content, className)} {...p} />;
export const PanelFooter = ({ className, ...p }: P) => <div className={cn(styles.footer, className)} {...p} />;
