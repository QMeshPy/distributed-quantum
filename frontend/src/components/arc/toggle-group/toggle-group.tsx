"use client";

import { createContext, useContext, useId, useLayoutEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../lib/motion-tokens";
import styles from "./toggle-group.module.css";

export type ToggleGroupSize = "sm" | "md";

interface ToggleGroupBase {
  children: ReactNode;
  /** Accessible name of the group, such as "Text style" or "Alignment". */
  label: string;
  size?: ToggleGroupSize;
  disabled?: boolean;
  className?: string;
}

export interface ToggleGroupSingleProps extends ToggleGroupBase {
  /** One option at most is pressed. Choosing another moves the pressed state across; the pressed option stays pressed. */
  type?: "single";
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: string) => void;
}

export interface ToggleGroupMultipleProps extends ToggleGroupBase {
  /** Each option toggles on its own. */
  type: "multiple";
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (value: string[]) => void;
}

export type ToggleGroupProps = ToggleGroupSingleProps | ToggleGroupMultipleProps;

export interface ToggleGroupItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "type"> {
  value: string;
  /** Accessible name, required when the item shows only an icon. Also used as the tooltip title unless title is set. */
  label?: string;
  children: ReactNode;
}

interface GroupContext {
  type: "single" | "multiple";
  id: string;
  pressed: readonly string[];
  toggle: (value: string) => void;
  tabStop: string | null;
  setFocused: (value: string) => void;
  disabled: boolean;
  reduced: boolean;
}

const Context = createContext<GroupContext | null>(null);

const items = (root: HTMLElement | null) => Array.from(root?.querySelectorAll<HTMLButtonElement>("[data-toggle-item]:not(:disabled)") ?? []);

/**
 * A row of toggle buttons. In single mode one pressed fill glides from option to option; in multiple mode each fill fades in
 * on its own and neighbours that are both on join into one shape. Arrow keys move focus, Space and Enter toggle.
 */
export function ToggleGroup(props: ToggleGroupProps) {
  const { children, label, size = "md", disabled = false, className } = props;
  const type = props.type ?? "single";
  const id = useId();
  const reduced = useReducedMotion() ?? false;
  const root = useRef<HTMLDivElement>(null);

  const [inner, setInner] = useState<readonly string[]>(() => {
    if (props.type === "multiple") return props.defaultValue ?? [];
    return props.defaultValue ? [props.defaultValue] : [];
  });
  const controlled = props.value !== undefined;
  const pressed: readonly string[] = props.type === "multiple" ? (props.value ?? inner) : controlled ? (props.value ? [props.value] : []) : inner;

  const toggle = (value: string) => {
    if (props.type === "multiple") {
      const next = pressed.includes(value) ? pressed.filter(entry => entry !== value) : [...pressed, value];
      if (!controlled) setInner(next);
      props.onValueChange?.(next);
      return;
    }
    // Single choice behaves like a radio group: choosing the pressed option again keeps it.
    if (pressed[0] === value) return;
    if (!controlled) setInner([value]);
    (props as ToggleGroupSingleProps).onValueChange?.(value);
  };

  // Roving tab stop: the last focused item, else the first pressed one, else the first item. Item order is read after each render.
  const [focused, setFocused] = useState<string | null>(null);
  const [order, setOrder] = useState<readonly string[]>([]);
  useLayoutEffect(() => {
    const next = items(root.current).map(item => item.dataset.value ?? "");
    setOrder(current => current.join("\u0000") === next.join("\u0000") ? current : next);
  }, [children]);
  const tabStop = (focused && order.includes(focused) ? focused : pressed.find(value => order.includes(value))) ?? order[0] ?? null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items(root.current);
    const index = list.findIndex(item => item === document.activeElement);
    if (index < 0) return;
    const last = list.length - 1;
    const target = event.key === "ArrowRight" || event.key === "ArrowDown" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index === 0 ? last : index - 1)
        : event.key === "Home" ? 0 : event.key === "End" ? last : -1;
    if (target < 0) return;
    event.preventDefault();
    list[target]!.focus();
  };

  const classes = [styles.group, styles[size], className].filter(Boolean).join(" ");
  return <Context.Provider value={{ type, id, pressed, toggle, tabStop, setFocused, disabled, reduced }}>
    <div ref={root} className={classes} role={type === "single" ? "radiogroup" : "group"} aria-label={label} aria-disabled={disabled || undefined} data-type={type} onKeyDown={onKeyDown}>
      <LayoutGroup id={id}>{children}</LayoutGroup>
    </div>
  </Context.Provider>;
}

export function ToggleGroupItem({ value, label, children, disabled: itemDisabled, className, title, onClick, onFocus, ...rest }: ToggleGroupItemProps) {
  const group = useContext(Context);
  if (!group) throw new Error("ToggleGroupItem must be used inside a ToggleGroup.");
  const { type, pressed, toggle, tabStop, setFocused, disabled: groupDisabled, reduced } = group;
  const on = pressed.includes(value);
  const disabled = groupDisabled || itemDisabled;
  const single = type === "single";
  return <button
    {...rest}
    type="button"
    className={[styles.item, className].filter(Boolean).join(" ")}
    data-toggle-item=""
    data-value={value}
    data-state={on ? "on" : "off"}
    role={single ? "radio" : undefined}
    aria-checked={single ? on : undefined}
    aria-pressed={single ? undefined : on}
    aria-label={label}
    title={title ?? label}
    disabled={disabled}
    tabIndex={tabStop === value ? 0 : -1}
    onFocus={event => { setFocused(value); onFocus?.(event); }}
    onClick={event => { onClick?.(event); if (!event.defaultPrevented) toggle(value); }}
  >
    {single
      ? on && <motion.span className={styles.fill} layoutId="fill" initial={false} style={{ borderRadius: 15 }} transition={reduced ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true" />
      : <span className={styles.fill} aria-hidden="true" />}
    <span className={styles.content}>{children}</span>
  </button>;
}

ToggleGroup.Item = ToggleGroupItem;

export default ToggleGroup;
