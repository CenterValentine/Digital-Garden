"use client";

import type { ResumeData } from "@/lib/resume/types";
import {
  groupSkillsByCategory,
  getFeaturedSkills,
} from "@/lib/resume/skills-utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/client/ui/card";
import { Badge } from "@/components/client/ui/badge";

interface SkillsSectionProps {
  skills: ResumeData["skills"];
}

export function SkillsSection({ skills }: SkillsSectionProps) {
  if (!skills || !skills.items || skills.items.length === 0) return null;

  const featuredSkills = getFeaturedSkills(skills.items, skills.featured);
  const grouped = groupSkillsByCategory(featuredSkills);

  const categoryLabels: Record<string, string> = {
    languages: "Languages",
    frameworks: "Frameworks",
    databases: "Databases",
    cloud: "Cloud",
    testing: "Testing",
    tools: "Tools",
    practices: "Practices",
  };

  return (
    <section className="mb-8">
      <h2 className="text-2xl font-semibold mb-6">Skills</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(grouped).map(([category, items]) => {
          if (items.length === 0) return null;

          const isFeatured = skills.featured?.some((name) =>
            items.some((item) => item.name === name)
          );

          return (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-base">
                  {categoryLabels[category] || category}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {items.map((skill) => {
                    const isSkillFeatured = skills.featured?.includes(
                      skill.name
                    );
                    return (
                      <Badge
                        key={skill.name}
                        variant={isSkillFeatured ? "default" : "outline"}
                        className="text-xs"
                      >
                        {skill.name}
                        {skill.proficiency && (
                          <span className="ml-1 text-xs opacity-75">
                            ({skill.proficiency})
                          </span>
                        )}
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
