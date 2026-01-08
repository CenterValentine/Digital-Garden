"use client";

import type { ResumeBullet } from "@/lib/resume/types";
import { Badge } from "@/components/client/ui/badge";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

interface BulletPointProps {
  bullet: ResumeBullet;
  showTags?: boolean;
  className?: string;
}

export function BulletPoint({
  bullet,
  showTags = false,
  className,
}: BulletPointProps) {
  return (
    <li className={`flex flex-col gap-1 ${className || ""}`}>
      <div className="flex items-start gap-2">
        <span className="text-muted-foreground mt-1">•</span>
        <span className="flex-1 text-sm leading-relaxed">{bullet.text}</span>
      </div>
      {(showTags && (bullet.impactTags?.length || bullet.keywords?.length)) ||
      bullet.evidence ? (
        <div className="ml-6 flex flex-wrap items-center gap-2">
          {showTags && bullet.impactTags && bullet.impactTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {bullet.impactTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {showTags && bullet.keywords && bullet.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {bullet.keywords.map((keyword) => (
                <Badge key={keyword} variant="outline" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
          )}
          {bullet.evidence && (
            <Link
              href={bullet.evidence.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {bullet.evidence.label}
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      ) : null}
    </li>
  );
}
