"use client";

import type { ResumeData } from "@/lib/resume/types";
import { formatDateRange } from "@/lib/resume/date-utils";
import { BulletPoint } from "./BulletPoint";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/client/ui/card";
import { Badge } from "@/components/client/ui/badge";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

interface ProjectsSectionProps {
  projects: ResumeData["projects"];
}

export function ProjectsSection({ projects }: ProjectsSectionProps) {
  if (!projects || projects.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-2xl font-semibold mb-6">Projects</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((project) => (
          <Card key={project.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">{project.name}</CardTitle>
                {project.dateRange && (
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDateRange(project.dateRange)}
                  </span>
                )}
              </div>
              {project.role && (
                <p className="text-sm text-muted-foreground">{project.role}</p>
              )}
            </CardHeader>
            <CardContent>
              {project.technologies && project.technologies.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {project.technologies.map((tech) => (
                    <Badge key={tech} variant="outline" className="text-xs">
                      {tech}
                    </Badge>
                  ))}
                </div>
              )}
              {project.bullets && project.bullets.length > 0 && (
                <ul className="space-y-2 mb-4">
                  {project.bullets.map((bullet) => (
                    <BulletPoint key={bullet.id} bullet={bullet} />
                  ))}
                </ul>
              )}
              {project.links && project.links.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {project.links.map((link) => (
                    <Link
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {link.label}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
