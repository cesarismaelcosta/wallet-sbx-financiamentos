import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const itemVariants = cva(
  "group/item flex w-full items-center gap-3 text-left transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-transparent hover:bg-accent/50",
        outline: "border border-border bg-transparent hover:bg-accent/50",
        muted: "bg-muted/50 hover:bg-muted",
      },
      size: {
        sm: "px-3 py-2 text-sm",
        default: "px-4 py-3 text-sm",
        lg: "px-5 py-4 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ItemProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof itemVariants> {
  asChild?: boolean;
}

/**
 * Linha de lista com mídia, conteúdo e ação — base para listas, opções e resultados.
 */
const Item = React.forwardRef<HTMLDivElement, ItemProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    return <Comp ref={ref} className={cn(itemVariants({ variant, size }), className)} {...props} />;
  },
);
Item.displayName = "Item";

/**
 * Agrupa vários Item, separados por hairline.
 */
const ItemGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="list"
      className={cn("flex w-full flex-col divide-y divide-border", className)}
      {...props}
    />
  ),
);
ItemGroup.displayName = "ItemGroup";

/**
 * Ícone, avatar ou miniatura do item.
 */
const ItemMedia = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-5", className)}
      {...props}
    />
  ),
);
ItemMedia.displayName = "ItemMedia";

const ItemContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)} {...props} />
  ),
);
ItemContent.displayName = "ItemContent";

const ItemTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("truncate font-medium text-foreground", className)} {...props} />
  ),
);
ItemTitle.displayName = "ItemTitle";

const ItemDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("truncate text-sm text-muted-foreground", className)} {...props} />
  ),
);
ItemDescription.displayName = "ItemDescription";

/**
 * Ação à direita do item (botão, badge, chevron).
 */
const ItemActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex shrink-0 items-center gap-2", className)} {...props} />
  ),
);
ItemActions.displayName = "ItemActions";

/**
 * Cabeçalho de um ItemGroup, em mono uppercase.
 */
const ItemHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "px-4 py-2 font-mono text-xs uppercase tracking-wider text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
ItemHeader.displayName = "ItemHeader";

/**
 * Rodapé de um ItemGroup.
 */
const ItemFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("px-4 py-2 text-xs text-muted-foreground", className)} {...props} />
  ),
);
ItemFooter.displayName = "ItemFooter";

const ItemSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} role="separator" className={cn("h-px w-full bg-border", className)} {...props} />
  ),
);
ItemSeparator.displayName = "ItemSeparator";

export {
  Item,
  ItemGroup,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemHeader,
  ItemFooter,
  ItemSeparator,
  itemVariants,
};
