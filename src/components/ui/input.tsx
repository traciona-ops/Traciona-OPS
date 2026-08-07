"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// text-base no mobile: abaixo de 16px o Safari do iOS dá zoom automático ao
// focar o campo e desmonta o layout. No desktop volta pra 14px pela densidade.
// Placeholder usa --color-muted (não muted-2): placeholder é texto e precisa
// dos 4.5:1.
const field =
  "w-full rounded-[var(--radius-field)] bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] px-3 text-base md:text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 focus:border-[var(--color-primary)] disabled:opacity-60 disabled:cursor-not-allowed transition";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(field, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(field, "py-2 resize-none", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";
