import type { ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** Kleiner Info-/Warn-Button, der Detailtexte in einen Tooltip auslagert. */
export function InfoHint({
  children,
  variant = 'info',
  label = 'Mehr Infos',
}: {
  children: ReactNode;
  variant?: 'info' | 'warning';
  label?: string;
}) {
  const Icon = variant === 'warning' ? AlertTriangle : Info;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            variant === 'warning' && 'text-orange-400 hover:text-orange-300',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left leading-relaxed">{children}</TooltipContent>
    </Tooltip>
  );
}
