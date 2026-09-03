import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Full-width inline banner. The class strings are lifted verbatim from the two
 * banners ExportDialog had grown, so this replaces them rather than adding a
 * third banner language to the app.
 */
const VARIANTS = {
  info: 'border-border bg-secondary text-muted-foreground',
  warning: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  error: 'border-red-500/40 bg-red-500/10 text-red-300',
  success: 'border-green-500/40 bg-green-500/10 text-green-300',
} as const;

const ICONS = {
  info: Info,
  warning: AlertTriangle,
  error: AlertTriangle,
  success: CheckCircle2,
} as const;

export function Notice({
  children,
  variant = 'info',
  className,
}: {
  children: ReactNode;
  variant?: keyof typeof VARIANTS;
  className?: string;
}) {
  const Icon = ICONS[variant];
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border p-3 text-xs leading-relaxed',
        VARIANTS[variant],
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
