import { Link } from "@tanstack/react-router";
import logoSrc from "@/assets/wallet-sbx-logo.png";
import { cn } from "@/lib/utils";

type WalletLogoProps = {
  /** Width of the logo image in pixels. Height auto-scales. */
  size?: "sm" | "md" | "lg";
  /** Show the "Financiamentos & Seguros" tagline below the logo. */
  withTagline?: boolean;
  /** Wrap in a Link to "/". */
  asLink?: boolean;
  /** Center the logo + tagline horizontally. */
  centered?: boolean;
  className?: string;
};

const SIZE_MAP: Record<NonNullable<WalletLogoProps["size"]>, string> = {
  sm: "h-6",
  md: "h-8",
  lg: "h-10",
};

const TAGLINE_SIZE: Record<NonNullable<WalletLogoProps["size"]>, string> = {
  sm: "text-[9px] tracking-[0.22em]",
  md: "text-[10px] tracking-[0.24em]",
  lg: "text-xs tracking-[0.26em]",
};

export function WalletLogo({
  size = "md",
  withTagline = false,
  asLink = false,
  centered = false,
  className,
}: WalletLogoProps) {
  const content = (
    <span
      className={cn(
        "inline-flex flex-col gap-1",
        centered ? "items-center" : "items-start",
        className,
      )}
    >
      <img
        src={logoSrc}
        alt="Wallet sbX"
        className={cn(SIZE_MAP[size], "w-auto select-none")}
        draggable={false}
      />
      {withTagline && (
        <span
          className={cn(
            "font-semibold uppercase text-muted-foreground",
            TAGLINE_SIZE[size],
          )}
        >
          Financiamentos &amp; Seguros
        </span>
      )}
    </span>
  );

  if (asLink) {
    return (
      <Link to="/" className="inline-flex">
        {content}
      </Link>
    );
  }

  return content;
}
