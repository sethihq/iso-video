'use client';

import * as React from 'react';
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

  return (
    <div className={cn('group relative', className)}>
      <SliderPrimitive.Root
        className="relative flex h-10 w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => {
          const val = Array.isArray(v) ? v[0] : v;
          onChange(val);
        }}
      >
        {/* Label */}
        {label && (
          <span className="absolute left-3 z-10 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
            {label}
          </span>
        )}

        {/* Value Display */}
        <span className="absolute right-3 z-10 text-xs font-mono text-foreground">
          {displayValue}
          {valueSubtext && (
            <span className="ml-0.5 text-muted-foreground">{valueSubtext}</span>
          )}
        </span>

        {/* Track */}
        <SliderPrimitive.Control
          className={cn(
            'relative h-10 w-full cursor-grab rounded-lg border border-border bg-muted/50',
            'transition-colors duration-150',
            'hover:border-primary/50 hover:bg-muted',
            'active:cursor-grabbing',
            disabled && 'pointer-events-none opacity-50'
          )}
        >
          <SliderPrimitive.Track className="relative h-full w-full overflow-hidden rounded-lg">
            {/* Filled portion */}
            <SliderPrimitive.Indicator
              className="h-full bg-primary/20"
              style={{ willChange: 'width' }}
            />
            {/* Thumb */}
            <SliderPrimitive.Thumb
              className={cn(
                'absolute top-1/2 -translate-y-1/2 h-8 w-2 rounded-sm bg-foreground/80 shadow-sm',
                'cursor-grab',
                'transition-[background-color,box-shadow] duration-150',
                'hover:bg-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'active:cursor-grabbing',
                disabled && 'pointer-events-none'
              )}
              style={{ willChange: 'left, transform' }}
            />
          </SliderPrimitive.Track>
        </SliderPrimitive.Control>
      </SliderPrimitive.Root>
    </div>
  );
}
