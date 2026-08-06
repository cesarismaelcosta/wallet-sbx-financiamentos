import { FileText } from "lucide-react";

export function PanelFooter({ footer }: { footer: any }) {
  if (!footer?.template_text) return null;
  const { template_text, links = [] } = footer;

  const renderText = () => {
    // Quebra a string pela regex de chaves para identificar onde os links devem ir
    const parts = template_text.split(/\{([^}]+)\}/g);
    
    return parts.map((part: string, index: number) => {
      const linkMatch = links.find((l: any) => l.text === part);
      
      if (linkMatch) {
        return (
          <a
            key={index}
            href={linkMatch.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            {part}
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="space-y-2 pt-2 break-inside-avoid">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5">
        <FileText size={14} /> Rodapé Legal (Footer)
      </h4>
      <footer className="py-3 px-3 text-center text-[10px] text-muted-foreground bg-slate-50 border border-slate-200 rounded-xl">
        <p className="leading-relaxed text-justify sm:text-center text-slate-400">
          {renderText()}
        </p>
      </footer>
    </div>
  );
}