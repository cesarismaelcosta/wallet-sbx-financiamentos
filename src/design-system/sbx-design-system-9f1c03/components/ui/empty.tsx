import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const emptyVariants = cva("flex w-full flex-col items-center justify-center text-center", {
  variants: {
    size: {
      sm: "gap-2 px-4 py-8",
      default: "gap-3 px-6 py-12",
      lg: "gap-4 px-8 py-20",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export interface EmptyProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof emptyVariants> {}

/**
 * Estado vazio padronizado: mídia, título, descrição e ação.
 */
const Empty = React.forwardRef<HTMLDivElement, EmptyProps>(({ className, size, ...props }, ref) => (
  <div ref={ref} className={cn(emptyVariants({ size }), className)} {...props} />
));
Empty.displayName = "Empty";

/**
 * Área de ícone ou ilustração do estado vazio.
 */
const EmptyMedia = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-6 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  ),
);
EmptyMedia.displayName = "EmptyMedia";

const EmptyTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-base font-medium text-foreground", className)} {...props} />
  ),
);
EmptyTitle.displayName = "EmptyTitle";

const EmptyDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("max-w-sm text-sm text-muted-foreground", className)} {...props} />
  ),
);
EmptyDescription.displayName = "EmptyDescription";

/**
 * Área de ações do estado vazio (botões).
 */
const EmptyContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mt-2 flex flex-wrap items-center justify-center gap-2", className)} {...props} />
  ),
);
EmptyContent.displayName = "EmptyContent";

export { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent, emptyVariants };
