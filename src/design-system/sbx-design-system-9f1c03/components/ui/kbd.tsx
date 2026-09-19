import * as React from "react";

import { cn } from "../../lib/utils";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {}

/**
 * Representa uma tecla ou atalho de teclado. Use dentro de KbdGroup para combinações.
 */
const Kbd = React.forwardRef<HTMLElement, KbdProps>(({ className, ...props }, ref) => (
  <kbd
    ref={ref}
    className={cn(
      "inline-flex h-5 min-w-5 select-none items-center justify-center rounded-sm border border-border bg-muted px-1.5 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground",
      className,
    )}
    {...props}
  />
));
Kbd.displayName = "Kbd";

export interface KbdGroupProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Agrupa várias teclas de um mesmo atalho (ex.: Ctrl + K).
 */
const KbdGroup = React.forwardRef<HTMLDivElement, KbdGroupProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("inline-flex items-center gap-1", className)} {...props} />
));
KbdGroup.displayName = "KbdGroup";

export { Kbd, KbdGroup };
