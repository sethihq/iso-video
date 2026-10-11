"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "@/lib/utils";

type InputProps = Omit<
  InputPrimitive.Props & React.RefAttributes<HTMLInputElement>,
  "size"
> & {
  size?: "sm" | "default" | "lg" | number;
  unstyled?: boolean;
  nativeInput?: boolean;
};

function Input({
  className,
  size = "default",
  unstyled = false,
  nativeInput = false,
  style,
  ...props
}: InputProps) {
  const inputClassName = cn(
    "h-8 w-full min-w-0 rounded-[inherit] bg-transparent px-2.5 leading-8 outline-none placeholder:text-faint",
    size === "sm" &&
      "h-7 px-2 leading-7",
    size === "lg" && "h-9 leading-9",
    props.type === "search" &&
      "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
    props.type === "file" &&
      "text-muted-foreground file:me-3 file:bg-transparent file:font-medium file:text-foreground file:text-sm",
  );

  return (
    <span
      className={
        cn(
          !unstyled &&
            "squircle relative inline-flex w-full rounded-[10px] bg-well text-[13px] transition-colors duration-100 hover:bg-well-hover has-focus:bg-white has-focus:shadow-[0_0_0_1px_rgba(0,0,0,0.06)] has-disabled:opacity-40 has-aria-invalid:shadow-[0_0_0_1px_var(--destructive)]",
          className,
        ) || undefined
      }
      data-size={size}
      data-slot="input-control"
    >
      {nativeInput ? (
        <input
          className={inputClassName}
          data-slot="input"
          size={typeof size === "number" ? size : undefined}
          style={typeof style === "function" ? undefined : style}
          {...props}
        />
      ) : (
        <InputPrimitive
          className={inputClassName}
          data-slot="input"
          size={typeof size === "number" ? size : undefined}
          style={style}
          {...props}
        />
      )}
    </span>
  );
}

export { Input, type InputProps };
