import { cn } from "../../lib/utils";
import { Loader2, LoaderCircle, LoaderPinwheel } from "lucide-react";
import { GradientIcon } from "./gradient-icon";

interface SpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "default" | "circle" | "pinwheel" | "gradient";
  /** Renderiza o ícone em cor sólida (currentColor) — use apenas sobre fundos gradiente */
  solid?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
};

const sizePx = {
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
};

export function Spinner({
  size = "md",
  variant = "gradient",
  solid = false,
  className,
}: SpinnerProps) {
  if (variant === "gradient") {
    return (
      <div
        role="status"
        aria-label="Carregando"
        className={cn("spinner-gradient", sizeClasses[size], className)}
      />
    );
  }

  const Icon =
    variant === "circle"
      ? LoaderCircle
      : variant === "pinwheel"
      ? LoaderPinwheel
      : Loader2;

  if (solid) {
    return (
      <Icon
        role="status"
        aria-label="Carregando"
        className={cn("animate-spin", sizeClasses[size], className)}
      />
    );
  }

  return (
    <GradientIcon
      role="status"
      aria-label="Carregando"
      icon={Icon}
      size={sizePx[size]}
      strokeWidth={2}
      className={cn("animate-spin", className)}
    />
  );
}
