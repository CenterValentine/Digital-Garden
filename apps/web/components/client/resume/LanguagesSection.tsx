"use client";

import type { ResumeData } from "@/lib/resume/types";
import { Badge } from "@/components/client/ui/badge";

interface LanguagesSectionProps {
  languages: ResumeData["languages"];
}

export function LanguagesSection({ languages }: LanguagesSectionProps) {
  if (!languages || languages.length === 0) return null;

  const proficiencyLabels: Record<string, string> = {
    native: "Native",
    professional: "Professional",
    conversational: "Conversational",
    basic: "Basic",
  };

  return (
    <section className="mb-8">
      <h2 className="text-2xl font-semibold mb-6">Languages</h2>
      <div className="flex flex-wrap gap-2">
        {languages.map((lang, index) => (
          <Badge key={index} variant="outline" className="text-sm">
            {lang.language} -{" "}
            {proficiencyLabels[lang.proficiency] || lang.proficiency}
          </Badge>
        ))}
      </div>
    </section>
  );
}
