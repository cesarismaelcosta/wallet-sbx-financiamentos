import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";
import { Label } from "./label";

const fieldVariants = cva("w-full", {
  variants: {
    orientation: {
      vertical: "flex flex-col gap-2",
      horizontal: "flex flex-row items-center justify-between gap-4",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
});

export interface FieldProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof fieldVariants> {}

/**
 * Wrapper de campo de formulário: rótulo, controle, texto de apoio e erro.
 * Independente de react-hook-form — use Form quando precisar de validação integrada.
 */
const Field = React.forwardRef<HTMLDivElement, FieldProps>(({ className, orientation, ...props }, ref) => (
  <div ref={ref} data-slot="field" className={cn(fieldVariants({ orientation }), className)} {...props} />
));
Field.displayName = "Field";

/**
 * Agrupa vários Field com espaçamento consistente.
 */
const FieldGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex w-full flex-col gap-6", className)} {...props} />
  ),
);
FieldGroup.displayName = "FieldGroup";

/**
 * Legenda de um conjunto de campos.
 */
const FieldLegend = React.forwardRef<HTMLLegendElement, React.HTMLAttributes<HTMLLegendElement>>(
  ({ className, ...props }, ref) => (
    <legend ref={ref} className={cn("text-sm font-medium text-foreground", className)} {...props} />
  ),
);
FieldLegend.displayName = "FieldLegend";

/**
 * Rótulo do campo, associado ao controle via htmlFor.
 */
const FieldLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => <Label ref={ref} className={cn("leading-snug", className)} {...props} />);
FieldLabel.displayName = "FieldLabel";

/**
 * Texto de apoio abaixo do controle.
 */
const FieldDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
FieldDescription.displayName = "FieldDescription";

/**
 * Mensagem de erro do campo. Sempre acompanhada de texto — nunca só cor.
 */
const FieldError = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      role="alert"
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    />
  ),
);
FieldError.displayName = "FieldError";

/**
 * Separador entre campos, com rótulo opcional ao centro.
 */
const FieldSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("relative flex items-center py-2", className)} {...props}>
      <span className="h-px flex-1 bg-border" />
      {children && <span className="px-3 text-xs uppercase tracking-wider text-muted-foreground">{children}</span>}
      {children && <span className="h-px flex-1 bg-border" />}
    </div>
  ),
);
FieldSeparator.displayName = "FieldSeparator";

export {
  Field,
  FieldGroup,
  FieldLegend,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldSeparator,
  fieldVariants,
};
