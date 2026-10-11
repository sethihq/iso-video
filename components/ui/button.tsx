"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

// Light and tactile, after the VibeCut editor: amber pills for the primary action,
// gray wells for the rest, and no borders
const buttonVariants = cva(
  "squircle relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap font-medium text-[13px] outline-none transition-[background-color,color,scale] duration-100 ease-micro active:scale-[0.97] pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: "h-8 px-3",
        icon: "size-8",
        "icon-lg": "size-9",
        "icon-sm": "size-7",
        "icon-xl": "size-10 [&_svg:not([class*='size-'])]:size-5",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 px-4",
        sm: "h-7 px-2.5 text-[12px]",
        xl: "h-10 px-5 text-[14px]",
        xs: "h-6 gap-1 px-2 text-[12px] [&_svg:not([class*='size-'])]:size-3.5",
      },
      variant: {
        default:
          "rounded-full bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_1px_2px_rgba(0,0,0,0.1)] hover:bg-primary-press disabled:shadow-none",
        destructive: "rounded-full bg-[#fde3dc] text-destructive-foreground hover:bg-[#fbd2c6]",
        "destructive-outline": "rounded-[10px] text-destructive-foreground hover:bg-[#fde3dc]",
        ghost: "rounded-[10px] text-muted-foreground hover:bg-black/5 hover:text-foreground data-pressed:bg-black/5",
        link: "text-foreground underline-offset-4 hover:underline",
        outline: "rounded-[10px] bg-well text-foreground hover:bg-well-hover",
        secondary: "rounded-[10px] bg-well text-foreground hover:bg-well-hover",
      },
    },
  },
);

interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: VariantProps<typeof buttonVariants>["variant"];
  size?: VariantProps<typeof buttonVariants>["size"];
}

function Button({ className, variant, size, render, ...props }: ButtonProps) {
  const typeValue: React.ButtonHTMLAttributes<HTMLButtonElement>["type"] =
    render ? undefined : "button";

  const defaultProps = {
    className: cn(buttonVariants({ className, size, variant })),
    "data-slot": "button",
    type: typeValue,
  };

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  });
}

export { Button, buttonVariants };
