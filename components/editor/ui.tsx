'use client';

import { cn } from '@/lib/utils';

/**
 * The editor's building blocks, after the VibeCut editor: pale gray panels,
 * darker gray wells for controls, white for what is lifted or focused, and
 * amber only for selection and the one primary action.
 */

/** A gray control surface: fields, selects, segmented controls. */
export const WELL = 'squircle flex h-8 min-w-0 items-center rounded-[10px] bg-well';

/** The white popover every menu opens. */
export const POPUP =
  'squircle rounded-[16px] bg-popover text-[13px] leading-[18px] text-popover-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_18px_40px_-14px_rgba(0,0,0,0.28)]';

/** Lifts the primary action off the page. */
export const PRIMARY_SHADOW = 'shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_1px_2px_rgba(0,0,0,0.1)]';

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  shortcut?: string;
  tone?: 'ghost' | 'well' | 'accent';
  active?: boolean;
  size?: 'sm' | 'md' | 'lg';
  tipSide?: 'top' | 'bottom';
};

export function IconButton({
  label,
  shortcut,
  tone = 'ghost',
  active = false,
  size = 'md',
  tipSide = 'bottom',
  className,
  children,
  ...props
}: IconButtonProps) {
  const toneClass = active
    ? 'bg-primary text-primary-foreground'
    : tone === 'accent'
      ? cn('bg-primary text-primary-foreground hover:bg-primary-press', PRIMARY_SHADOW)
      : tone === 'well'
        ? 'bg-well text-muted-foreground hover:bg-well-hover hover:text-foreground'
        : 'text-muted-foreground hover:bg-black/5 hover:text-foreground';
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active ? true : undefined}
      data-tip={shortcut ? `${label} (${shortcut})` : label}
      data-tip-side={tipSide}
      className={cn(
        'tip squircle relative grid shrink-0 place-items-center rounded-full transition-[scale,background-color,color] duration-100 ease-micro active:scale-[0.94] disabled:pointer-events-none disabled:opacity-35',
        size === 'sm' ? 'size-7' : size === 'lg' ? 'size-9' : 'size-8',
        toneClass,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex h-8 items-center justify-between gap-2">
      <h3 className="text-[12px] font-medium text-faint">{children}</h3>
      {action}
    </div>
  );
}

/** A small label above a control. */
export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[12px] font-medium text-muted-foreground">
      {children}
    </label>
  );
}

const segmentClass = (selected: boolean) =>
  cn(
    'squircle relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[8px] px-2 text-[12px] font-medium transition-[background-color,color,scale] duration-100 active:scale-[0.96]',
    selected ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-black/5 hover:text-foreground'
  );

/** Picks one of a few options. The chosen one turns amber. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: React.ReactNode; title?: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn(WELL, 'gap-0.5 p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          aria-label={option.title}
          onClick={() => onChange(option.value)}
          className={cn(segmentClass(option.value === value), 'h-full')}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Switches between panels. The open one is lifted in white, keeping amber for choices. */
export function TabSwitch<T extends string>({
  label,
  value,
  tabs,
  onChange,
  idPrefix,
}: {
  label: string;
  value: T;
  tabs: readonly { value: T; label: React.ReactNode }[];
  onChange: (value: T) => void;
  idPrefix: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn(WELL, 'gap-0.5 p-0.5')}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.value}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={cn(
              'squircle relative flex h-full min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[8px] px-2 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-100',
              selected
                ? 'bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
