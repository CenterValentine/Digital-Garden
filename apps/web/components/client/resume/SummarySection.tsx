"use client";

import type { ResumeData } from "@/lib/resume/types";
import { BulletPoint } from "./BulletPoint";

interface SummarySectionProps {
  summary: ResumeData["summary"];
}

export function SummarySection({ summary }: SummarySectionProps) {
  if (!summary) return null;

  return (
    <section className="mb-8">
      <h2 className="text-2xl font-semibold mb-4">Summary</h2>
      {summary.paragraphs && summary.paragraphs.length > 0 && (
        <div className="space-y-2 mb-4">
          {summary.paragraphs.map((paragraph, index) => (
            <p
              key={index}
              className="text-sm leading-relaxed text-muted-foreground"
            >
              {paragraph}
            </p>
          ))}
        </div>
      )}
      {summary.highlights && summary.highlights.length > 0 && (
        <ul className="space-y-2">
          {summary.highlights.map((highlight) => (
            <BulletPoint key={highlight.id} bullet={highlight} />
          ))}
        </ul>
      )}
    </section>
  );
}
