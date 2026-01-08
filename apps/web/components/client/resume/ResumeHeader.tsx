"use client";

import type { ResumeData } from "@/lib/resume/types";
import { formatLocation } from "./utils";
import Link from "next/link";
import { Mail, Phone, ExternalLink } from "lucide-react";

interface ResumeHeaderProps {
  personalInfo: ResumeData["personalInfo"];
}

export function ResumeHeader({ personalInfo }: ResumeHeaderProps) {
  return (
    <div className="mb-8 space-y-4">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">
          {personalInfo.name}
        </h1>
        <p className="text-xl text-muted-foreground mt-2">
          {personalInfo.headline}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {personalInfo.location && (
          <span className="text-muted-foreground">
            {formatLocation(personalInfo.location)}
          </span>
        )}
        <a
          href={`mailto:${personalInfo.email}`}
          className="flex items-center gap-1 text-primary hover:underline"
        >
          <Mail className="h-4 w-4" />
          {personalInfo.email}
        </a>
        {personalInfo.phone && (
          <a
            href={`tel:${personalInfo.phone}`}
            className="flex items-center gap-1 text-primary hover:underline"
          >
            <Phone className="h-4 w-4" />
            {personalInfo.phone}
          </a>
        )}
        {personalInfo.links?.map((link) => (
          <Link
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
          >
            {link.label}
            <ExternalLink className="h-3 w-3" />
          </Link>
        ))}
      </div>
    </div>
  );
}
