"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { NAV } from "../landing-content";
import styles from "../landing.module.css";

/** The section links are hidden below 1080px, so this panel carries them there. */
export function NavMenu({ nav, repositoryHref, consoleHref }: { nav: typeof NAV; repositoryHref: string; consoleHref: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const wide = window.matchMedia("(min-width: 1081px)");
    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      button.current?.focus();
    };
    root.style.overflow = "hidden";
    wide.addEventListener("change", close);
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = "";
      wide.removeEventListener("change", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <>
      <button
        ref={button}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls="landing-menu"
        aria-label={open ? nav.menu.close : nav.menu.open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>
      {open ? (
        <div id="landing-menu" className={styles.menuPanel} data-lenis-prevent>
          <nav aria-label="Sections">
            {nav.links.map((link) => (
              <a key={link.href} href={link.href} className={styles.menuLink} onClick={close}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className={styles.menuActions}>
            <Link href={consoleHref} className={styles.pill}>
              {nav.primary}
            </Link>
            <a href={repositoryHref} target="_blank" rel="noreferrer" className={styles.pillGhost}>
              {nav.secondary}
            </a>
          </div>
        </div>
      ) : null}
    </>
  );
}
