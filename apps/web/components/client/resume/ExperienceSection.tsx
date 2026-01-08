"use client";

import type { ResumeData } from "@/lib/resume/types";
import { formatDateRange, sortByDateRange } from "@/lib/resume/date-utils";
import { formatLocation } from "./utils";
import { BulletPoint } from "./BulletPoint";
import { Badge } from "@/components/client/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/client/ui/card";

interface ExperienceSectionProps {
  experience: ResumeData["experience"];
}

export function ExperienceSection({ experience }: ExperienceSectionProps) {
  if (!experience || experience.length === 0) return null;

  const sortedExperience = sortByDateRange(experience);

  return (
    <section className="mb-8">
      <h2 className="text-2xl font-semibold mb-6">Experience</h2>
      <div className="space-y-6">
        {sortedExperience.map((exp) => (
          <Card key={exp.id}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">{exp.position}</CardTitle>
                  <p className="text-base font-medium text-muted-foreground mt-1">
                    {exp.company}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  {formatDateRange(exp.dateRange)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-2">
                {exp.location && <span>{formatLocation(exp.location)}</span>}
                {exp.employmentType && <span>• {exp.employmentType}</span>}
                {exp.teamOrOrg && <span>• {exp.teamOrOrg}</span>}
              </div>
            </CardHeader>
            <CardContent>
              {exp.technologies && exp.technologies.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {exp.technologies.map((tech) => (
                    <Badge key={tech} variant="outline" className="text-xs">
                      {tech}
                    </Badge>
                  ))}
                </div>
              )}
              {exp.bullets && exp.bullets.length > 0 && (
                <ul className="space-y-2">
                  {exp.bullets.map((bullet) => (
                    <BulletPoint key={bullet.id} bullet={bullet} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
