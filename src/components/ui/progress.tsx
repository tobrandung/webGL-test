import { Progress as ProgressPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * Determinate and indeterminate progress bar. Pass `value={null}` for work
 * whose length is unknown (the gain-map encode), which Radix reports as
 * `data-state="indeterminate"`.
 */
function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const indeterminate = value === null || value === undefined;
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-secondary', className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          'h-full w-full flex-1 bg-primary transition-transform duration-200 ease-out',
          indeterminate && 'animate-pulse motion-reduce:animate-none',
        )}
        style={{ transform: `translateX(-${100 - (indeterminate ? 40 : (value ?? 0))}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
