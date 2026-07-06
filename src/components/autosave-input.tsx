"use client";

import { Input, Textarea } from "@/components/ui/input";
import { useDebouncedCommit } from "@/lib/use-debounced-commit";

// Drop-in replacements for the uncontrolled text fields. They keep the same
// defaultValue + onBlur behaviour but ALSO autosave ~700ms after typing stops,
// so a value persists without the field ever losing focus (the phone-locked /
// app-backgrounded "it didn't save" case). Pass `onCommit(value)` with the save
// you'd have run on blur.

type InputProps = Omit<React.ComponentProps<"input">, "onChange" | "onBlur"> & {
  onCommit: (value: string) => void;
};

export function AutosaveInput({ onCommit, ...rest }: InputProps) {
  const { schedule, flush } = useDebouncedCommit(onCommit);
  return (
    <Input
      {...rest}
      onChange={(e) => schedule(e.target.value)}
      onBlur={() => flush()}
    />
  );
}

type TextareaProps = Omit<
  React.ComponentProps<"textarea">,
  "onChange" | "onBlur"
> & {
  onCommit: (value: string) => void;
};

export function AutosaveTextarea({ onCommit, ...rest }: TextareaProps) {
  const { schedule, flush } = useDebouncedCommit(onCommit);
  return (
    <Textarea
      {...rest}
      onChange={(e) => schedule(e.target.value)}
      onBlur={() => flush()}
    />
  );
}
