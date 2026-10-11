'use client';

import * as React from 'react';
import { useId } from 'react';
import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import { cn } from '@/lib/utils';

interface CustomSliderProps {
  label?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  valueSubtext?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
  className?: string;
}

export function CustomSlider({
  label,
  value,
  min,
  max,
  step = 1,
  valueSubtext = '',
  disabled = false,
  onChange,
  className,
}: CustomSliderProps) {
  const displayValue = step < 1 ? value.toFixed(2) : Math.round(value);
  const labelId = useId();
  const valueId = useId();

  // A gray well you drag across: the label and value sit inside it, the filled part is a shade darker
  return (
    <div className={cn('group relative', className)}>
      <SliderPrimitive.Root
        className="relative flex h-8 w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => {
          const val = Array.isArray(v) ? v[0] : v;
          onChange(val);
        }}
        aria-labelledby={label ? labelId : undefined}
        aria-describedby={valueId}
      >
        {label && (
          <span
            id={labelId}
            className="pointer-events-none absolute left-2.5 z-10 text-[12px] font-medium text-muted-foreground transition-colors group-hover:text-foreground"
          >
            {label}
          </span>
        )}

        <span
          id={valueId}
          className="pointer-events-none absolute right-2.5 z-10 text-[12px] tabular-nums text-foreground"
          aria-live="polite"
        >
          {displayValue}
          {valueSubtext && <span className="ml-0.5 text-faint">{valueSubtext}</span>}
        </span>

        <SliderPrimitive.Control
          className={cn(
            'squircle relative h-8 w-full cursor-ew-resize rounded-[10px] bg-well transition-colors duration-100 hover:bg-well-hover',
            disabled && 'pointer-events-none opacity-40'
          )}
        >
          <SliderPrimitive.Track className="relative h-full w-full overflow-hidden rounded-[10px]">
            <SliderPrimitive.Indicator className="h-full bg-black/[0.06]" />
            <SliderPrimitive.Thumb
              className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.2)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
          </SliderPrimitive.Track>
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
    </div>
  );
}
