"use client";

import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/arc/button/button";

// shortcut: router.push, not an <a>, so no middle-click or open-in-new-tab; upgrade when Arc's Button gains an anchor mode.
export function LinkButton({ href, onClick, ...props }: ButtonProps & { href: string }) {
  const router = useRouter();
  return (
    <Button
      {...props}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) router.push(href);
      }}
    />
  );
}
