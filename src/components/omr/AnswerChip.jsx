import React, { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function optionStyle(option) {
  if (!option || option === "BLANK")
    return { label: "Blank", cls: "bg-muted text-muted-foreground border-border" };
  if (option === "MULTIPLE")
    return { label: "Multi", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  if (option === "UNCLEAR")
    return { label: "?", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: option, cls: "bg-emerald-600 text-white border-emerald-600" };
}

export default function AnswerChip({ question, option, optionsCount, onCorrect }) {
  const [open, setOpen] = useState(false);
  const s = optionStyle(option);
  const letters = Array.from({ length: optionsCount }, (_, i) =>
    String.fromCharCode(65 + i)
  );

  const pick = (o) => {
    setOpen(false);
    if (o !== option) onCorrect(question, o);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
          title="Tap to correct this answer"
        >
          <span className="w-6 shrink-0 text-sm font-medium text-muted-foreground">
            {question}
          </span>
          <span
            className={cn(
              "ml-auto inline-flex min-w-7 items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold",
              s.cls
            )}
          >
            {s.label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Question {question} — correct answer
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[...letters, "BLANK"].map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => pick(o)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors",
                o === option
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-accent"
              )}
            >
              {o === "BLANK" ? "Blank" : o}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}