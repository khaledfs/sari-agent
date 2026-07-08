import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

import { radius, shadow, spacing } from "@/design/tokens";

type CardOwnProps<T extends ElementType = "div"> = {
  as?: T;
  clickable?: boolean;
  children: ReactNode;
  className?: string;
};

type CardProps<T extends ElementType = "div"> = CardOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof CardOwnProps<T>>;

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Card<T extends ElementType = "div">({
  as,
  clickable = false,
  children,
  className,
  style,
  ...rest
}: CardProps<T>) {
  const Component = (as ?? "div") as ElementType;
  return (
    <Component
      className={cx("ds-card", clickable && "ds-card--clickable", className)}
      style={{
        borderRadius: radius.md,
        boxShadow: shadow.sm,
        padding: spacing.md,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Component>
  );
}
