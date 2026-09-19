import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

/**
 * Envolve um Input/Textarea com prefixos e sufixos (ícone, texto ou botão).
 */
const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="input-group"
      className={cn(
        "relative flex w-full items-center rounded-md border border-input bg-background transition-colors duration-150 ease-out focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        className,
      )}
      {...props}
    />
  ),
);
InputGroup.displayName = "InputGroup";

const inputGroupAddonVariants = cva(
  "flex shrink-0 items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      align: {
        start: "pl-3",
        end: "pr-3",
      },
    },
    defaultVariants: {
      align: "start",
    },
  },
);

export interface InputGroupAddonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof inputGroupAddonVariants> {}

/**
 * Conteúdo estático (ícone, moeda, sufixo) acoplado ao campo.
 */
const InputGroupAddon = React.forwardRef<HTMLDivElement, InputGroupAddonProps>(
  ({ className, align, ...props }, ref) => (
    <div ref={ref} className={cn(inputGroupAddonVariants({ align }), className)} {...props} />
  ),
);
InputGroupAddon.displayName = "InputGroupAddon";

/**
 * Campo de texto sem borda própria, para uso exclusivo dentro de InputGroup.
 */
const InputGroupInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
InputGroupInput.displayName = "InputGroupInput";

/**
 * Área para ações (botões) acopladas ao campo.
 */
const InputGroupButtonGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex shrink-0 items-center gap-1 pr-1", className)} {...props} />
  ),
);
InputGroupButtonGroup.displayName = "InputGroupButtonGroup";

export { InputGroup, InputGroupAddon, InputGroupInput, InputGroupButtonGroup, inputGroupAddonVariants };
