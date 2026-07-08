import type { HTMLAttributes, ReactNode } from "react";

import { colors, radius, spacing } from "@/design/tokens";
import { typography } from "@/design/typography";

export type StatusBadgeState = "paid" | "unpaid" | "overdue" | "neutral";

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  status: StatusBadgeState;
  children: ReactNode;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const accentByStatus: Record<StatusBadgeState, string> = {
  paid: colors.success,
  unpaid: colors.warning,
  overdue: colors.danger,
  neutral: colors.textSecondary,
};

export function StatusBadge({ status, children, className, style, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cx("ds-badge", `ds-badge--${status}`, typography.small, className)}
      style={{
        borderRadius: radius.xl,
        paddingInline: spacing.sm,
        boxShadow: `inset 0 0 0 1px ${accentByStatus[status]}22`,
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
