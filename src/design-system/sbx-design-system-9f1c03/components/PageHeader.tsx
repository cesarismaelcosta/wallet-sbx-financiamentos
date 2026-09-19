import { ReactNode } from "react";
import { cn } from "../lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}

/**
 * Faixa de título de página · gradiente accent (#64A1E7 → #2246A7), texto branco.
 * Usar apenas uma vez por tela, no título principal.
 */
export function PageHeader({ eyebrow, title, description, className }: PageHeaderProps) {
  return (
    <div className={cn("page-header", className)}>
      {eyebrow && <p className="page-header-eyebrow">{eyebrow}</p>}
      <h1 className="page-header-title">{title}</h1>
      {description && <p className="page-header-description">{description}</p>}
    </div>
  );
}

export default PageHeader;
