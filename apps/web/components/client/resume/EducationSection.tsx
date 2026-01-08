"use client";

import type { ResumeData } from "@/lib/resume/types";
import { formatDateRange, sortByDateRange } from "@/lib/resume/date-utils";
import { formatLocation } from "./utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/client/ui/card";
import { Badge } from "@/components/client/ui/badge";

interface EducationSectionProps {
  education: ResumeData["education"];
}

export function EducationSection({ education }: EducationSectionProps) {
  if (!education || education.length === 0) return null;

  const sortedEducation = sortByDateRange(education);

  return (
    <section className="mb-8">
      <h2 className="text-2xl font-semibold mb-6">Education</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {sortedEducation.map((edu) => (
          <Card key={edu.id}>
            <CardHeader>
              <CardTitle className="text-lg">{edu.institution}</CardTitle>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  {edu.degree} {edu.field && `in ${edu.field}`}
                </p>
                {edu.location && <p>{formatLocation(edu.location)}</p>}
                {edu.dateRange && <p>{formatDateRange(edu.dateRange)}</p>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {edu.gpa && (
                  <p className="text-muted-foreground">GPA: {edu.gpa}</p>
                )}
                {edu.honors && edu.honors.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {edu.honors.map((honor) => (
                      <Badge
                        key={honor}
                        variant="secondary"
                        className="text-xs"
                      >
                        {honor}
                      </Badge>
                    ))}
                  </div>
                )}
                {edu.coursework && edu.coursework.length > 0 && (
                  <div>
                    <p className="font-medium mb-1">Relevant Coursework:</p>
                    <div className="flex flex-wrap gap-2">
                      {edu.coursework.map((course) => (
                        <Badge
                          key={course}
                          variant="outline"
                          className="text-xs"
                        >
                          {course}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
