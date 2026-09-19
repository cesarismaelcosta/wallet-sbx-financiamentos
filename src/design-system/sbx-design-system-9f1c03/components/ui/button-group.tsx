import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonGroupVariants = cva("inline-flex", {
  variants: {
    orientation: {
      horizontal:
        "flex-row [&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none [&>*:not(:first-child)]:-ml-px",
      vertical:
        "flex-col [&>*:not(:first-child)]:rounded-t-none [&>*:not(:last-child)]:rounded-b-none [&>*:not(:first-child)]:-mt-px",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

export interface ButtonGroupProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof buttonGroupVariants> {}

/**
 * Agrupa botões relacionados em um único bloco contínuo (split button, toolbar).
 */
const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, orientation, ...props }, ref) => (
    <div
      ref={ref}
      role="group"
      className={cn(buttonGroupVariants({ orientation }), "[&>*]:relative [&>*:focus-visible]:z-10", className)}
      {...props}
    />
  ),
);
ButtonGroup.displayName = "ButtonGroup";

/**
 * Rótulo ou texto estático dentro de um ButtonGroup.
 */
const ButtonGroupText = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex h-10 items-center border border-input bg-muted px-3 text-sm font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
ButtonGroupText.displayName = "ButtonGroupText";

/**
 * Separador visual entre botões do grupo.
 */
const ButtonGroupSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} role="separator" className={cn("w-px self-stretch bg-border", className)} {...props} />
  ),
);
ButtonGroupSeparator.displayName = "ButtonGroupSeparator";

export { ButtonGroup, ButtonGroupText, ButtonGroupSeparator, buttonGroupVariants };
