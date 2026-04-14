import type { InputHTMLAttributes } from "react";

import { colors, radius } from "@/design/tokens";
import { typography } from "@/design/typography";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  search?: boolean;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Input({ search = false, className, style, ...props }: InputProps) {
  return (
    <input
      className={cx("ds-input", search && "ds-input--search", typography.body, className)}
      style={{
        borderRadius: radius.sm,
        borderColor: colors.primarySoft,
        ...style,
      }}
      {...props}
    />
  );
}
