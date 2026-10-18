import React from "react";
import AnswerChip from "@/components/omr/AnswerChip";

export default function ResultsView({
  answers,
  questionCount,
  optionsCount,
  imageUrl,
  onCorrect,
}) {
  const byQ = {};
  answers.forEach((a) => {
    byQ[a.question] = a.option;
  });
  const answered = answers.filter(
    (a) => a.option && !["BLANK", "UNCLEAR", "MULTIPLE"].includes(a.option)
  ).length;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {imageUrl && (
        <div className="self-start lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <img
              src={imageUrl}
              alt="Scanned OMR sheet"
              className="max-h-[70vh] w-full bg-muted/30 object-contain"
            />
          </div>
        </div>
      )}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight">Detected answers</h3>
          <span className="text-sm text-muted-foreground">
            {answered} of {questionCount} marked
          </span>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Tap any answer to correct it — every correction helps the scanner read your
          sheets more accurately next time.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: questionCount }, (_, i) => i + 1).map((q) => (
            <AnswerChip
              key={q}
              question={q}
              option={byQ[q]}
              optionsCount={optionsCount}
              onCorrect={onCorrect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}