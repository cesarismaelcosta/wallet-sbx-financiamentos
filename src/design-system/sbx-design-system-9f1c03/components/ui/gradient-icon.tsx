import { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "../../lib/utils";
import { useRef, useEffect, useState } from "react";

interface GradientIconProps extends Omit<LucideProps, 'ref'> {
  icon: LucideIcon;
}

/**
 * Renders a Lucide icon filled with the institutional brand color (black in light theme, white in dark).
 * Uses SVG serialization to create a mask and applies CSS gradient on top.
 */
export function GradientIcon({ 
  icon: Icon, 
  className,
  size = 20,
  strokeWidth = 1.5,
  ...props 
}: GradientIconProps) {
  const iconRef = useRef<HTMLSpanElement>(null);
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const iconSize = typeof size === 'number' ? size : 20;

  useEffect(() => {
    if (iconRef.current) {
      const svgElement = iconRef.current.querySelector('svg');
      if (svgElement) {
        const clonedSvg = svgElement.cloneNode(true) as SVGElement;
        clonedSvg.querySelectorAll('*').forEach((el) => {
          if (el.hasAttribute('stroke') || ['path','line','circle','rect','polyline','polygon'].includes(el.tagName)) {
            el.setAttribute('stroke', 'white');
          }
          if (el.hasAttribute('fill') && el.getAttribute('fill') !== 'none') {
            el.setAttribute('fill', 'white');
          }
        });
        clonedSvg.setAttribute('stroke', 'white');
        const svgString = new XMLSerializer().serializeToString(clonedSvg);
        const encoded = encodeURIComponent(svgString);
        setMaskUrl(`url("data:image/svg+xml,${encoded}")`);
      }
    }
  }, []);

  return (
    <span className={cn("relative inline-flex items-center justify-center", className)}
          style={{ width: iconSize, height: iconSize }}>
      <span ref={iconRef} className="absolute opacity-0 pointer-events-none">
        <Icon size={iconSize} strokeWidth={strokeWidth} {...props} />
      </span>
      {maskUrl && (
        <span className="absolute inset-0"
              style={{
                background: 'var(--gradient-accent)',
                WebkitMaskImage: maskUrl, WebkitMaskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center',
                maskImage: maskUrl, maskSize: 'contain',
                maskRepeat: 'no-repeat', maskPosition: 'center',
              }} />
      )}
      {!maskUrl && <Icon size={iconSize} strokeWidth={strokeWidth} className="text-brand-accent" {...props} />}
    </span>
  );
}
