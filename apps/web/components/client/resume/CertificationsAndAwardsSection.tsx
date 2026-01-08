"use client";

import type { ResumeData } from "@/lib/resume/types";
import { formatDate } from "@/lib/resume/date-utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/client/ui/card";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/client/ui/badge";

interface CertificationsAndAwardsSectionProps {
  certifications: ResumeData["certifications"];
  awards: ResumeData["awards"];
}

export function CertificationsAndAwardsSection({
  certifications,
  awards,
}: CertificationsAndAwardsSectionProps) {
  const hasCertifications = certifications && certifications.length > 0;
  const hasAwards = awards && awards.length > 0;

  if (!hasCertifications && !hasAwards) return null;

  return (
    <section className="mb-8">
      <h2 className="text-2xl font-semibold mb-6">Certifications & Awards</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Certifications */}
        {hasCertifications &&
          certifications.map((cert) => (
            <Card key={cert.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{cert.name}</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    Certification
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>{cert.issuer}</p>
                  <p>Issued: {formatDate(cert.date)}</p>
                  {cert.expiryDate && (
                    <p>Expires: {formatDate(cert.expiryDate)}</p>
                  )}
                  {cert.credentialId && (
                    <p className="font-mono text-xs">ID: {cert.credentialId}</p>
                  )}
                </div>
              </CardHeader>
              {cert.url && (
                <CardContent>
                  <Link
                    href={cert.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Verify Credential
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </CardContent>
              )}
            </Card>
          ))}

        {/* Awards */}
        {hasAwards &&
          awards.map((award) => (
            <Card key={award.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{award.title}</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    Award
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  {award.issuer && <p>{award.issuer}</p>}
                  {award.date && <p>{formatDate(award.date)}</p>}
                </div>
              </CardHeader>
              {award.description && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {award.description}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
      </div>
    </section>
  );
}

