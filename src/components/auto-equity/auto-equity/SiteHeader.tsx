/**
 * Header sticky com logo e âncoras para as seções da página.
 */
const links = [
  { href: "#simular", label: "Simular" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#duvidas", label: "Dúvidas" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <a href="#simular" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            W
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">Wallet sbX</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Crédito com Garantia
            </p>
          </div>
        </a>
        <nav className="-mx-2 flex items-center gap-1 overflow-x-auto px-2 sm:gap-2">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
