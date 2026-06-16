import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-normal whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border border-[var(--grey15)] text-foreground",
        green: "bg-[var(--status-green-bg)] text-[var(--status-green)]",
        amber: "bg-[var(--status-amber-bg)] text-[var(--status-amber)]",
        red: "bg-[var(--status-red-bg)] text-[var(--status-red)]",
        neutral: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
