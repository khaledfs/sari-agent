import type { ButtonHTMLAttributes } from "react";

import { radius, spacing } from "@/design/tokens";

type ButtonVariant = "primary" | "secondary" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  block?: boolean;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  block = false,
  className,
  style,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("ds-btn", `ds-btn--${variant}`, block && "ds-btn--block", className)}
      style={{
        borderRadius: radius.sm,
        paddingInline: spacing.md,
        ...style,
      }}
      {...props}
    />
  );
}
