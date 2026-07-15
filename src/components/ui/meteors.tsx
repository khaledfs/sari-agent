"use client";
import React from "react";

// Local class joiner — this project has no @/lib/utils `cn` helper and the
// effect must stay dependency-free (no clsx / tailwind-merge / motion).
function cn(...classes: Array<string | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export const Meteors = ({
  number,
  className,
}: {
  number?: number;
  className?: string;
}) => {
  const meteorCount = number || 20;
  const meteors = new Array(meteorCount).fill(true);
  return (
    <div>
      {meteors.map((el, idx) => {
        // Calculate position to evenly distribute meteors across container width
        const position = idx * (800 / meteorCount) - 400; // Spread across 800px range, centered

        // Deterministic pseudo-random timing from the index — Math.random()
        // here would render different values on server vs client (hydration mismatch).
        const delaySeconds = ((idx * 37) % 50) / 10; // 0s – 4.9s
        const durationSeconds = 5 + ((idx * 53) % 50) / 10; // 5s – 9.9s

        return (
          <span
            key={"meteor" + idx}
            className={cn(
              "animate-meteor-effect absolute h-0.5 w-0.5 rotate-[45deg] rounded-[9999px] bg-slate-500 shadow-[0_0_0_1px_#ffffff10]",
              "before:absolute before:top-1/2 before:h-[1px] before:w-[50px] before:-translate-y-[50%] before:transform before:bg-gradient-to-r before:from-[#64748b] before:to-transparent before:content-['']",
              className,
            )}
            style={{
              top: "-40px", // Start above the container
              left: position + "px",
              animationDelay: delaySeconds + "s",
              animationDuration: durationSeconds + "s",
            }}
          ></span>
        );
      })}
    </div>
  );
};
