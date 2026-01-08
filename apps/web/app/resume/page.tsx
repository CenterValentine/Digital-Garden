"use client";

import { useState, useEffect, useMemo } from "react";
import { resumeData } from "@/lib/resume/data/resume-data";
import type { ResumeSectionKey, PDFExportOptions } from "@/lib/resume/types";
import type { FilterState } from "@/lib/resume/filtering";
import { applyFilters } from "@/lib/resume/filtering";
import { applyOnePageSelection } from "@/lib/resume/scoring";
import { FilterPanel } from "@/components/client/resume/FilterPanel";
import { PDFExportButton } from "@/components/client/resume/PDFExportButton";
import { ResumeHeader } from "@/components/client/resume/ResumeHeader";
import { SummarySection } from "@/components/client/resume/SummarySection";
import { ExperienceSection } from "@/components/client/resume/ExperienceSection";
import { EducationSection } from "@/components/client/resume/EducationSection";
import { SkillsSection } from "@/components/client/resume/SkillsSection";
import { ProjectsSection } from "@/components/client/resume/ProjectsSection";
import { CertificationsAndAwardsSection } from "@/components/client/resume/CertificationsAndAwardsSection";
import { LanguagesSection } from "@/components/client/resume/LanguagesSection";
import { BackgroundGradient } from "@/components/client/third-party/aceternity/BackgroundGradient";

const STORAGE_KEY = "resume-filter-state";

const defaultFilterState: FilterState = {
  sections: {
    summary: true,
    experience: true,
    skills: true,
    projects: true,
    education: true,
    certifications: true,
    awards: true,
    languages: true,
  },
  variantId: undefined,
  tags: [],
  priorityThreshold: 0,
};

function getInitialFilterState(): FilterState {
  if (typeof window === "undefined") return defaultFilterState;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new sections
      return {
        ...defaultFilterState,
        ...parsed,
        sections: {
          ...defaultFilterState.sections,
          ...parsed.sections,
        },
      };
    }
  } catch (error) {
    console.error("Failed to load filter state from localStorage:", error);
  }

  return defaultFilterState;
}

export default function ResumePage() {
  const [filterState, setFilterState] = useState<FilterState>(
    getInitialFilterState
  );

  // Persist filter state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filterState));
    } catch (error) {
      console.error("Failed to save filter state to localStorage:", error);
    }
  }, [filterState]);

  // Apply filters to resume data
  const filteredData = useMemo(() => {
    return applyFilters(resumeData, filterState, "web");
  }, [filterState]);

  // Get section order from variant or use default
  const sectionOrder = useMemo(() => {
    const variant = resumeData.variants?.find(
      (v) => v.id === filterState.variantId
    );
    return (
      variant?.sectionOrder ||
      resumeData.meta?.canonicalOrder || [
        "summary",
        "experience",
        "skills",
        "projects",
        "education",
        "certifications",
        "awards",
        "languages",
      ]
    );
  }, [filterState.variantId]);

  const handleExport = async (options: PDFExportOptions) => {
    try {
      // Apply filters and scoring for PDF
      let pdfData = applyFilters(resumeData, filterState, "pdf");

      if (options.format === "one-page") {
        const variant = resumeData.variants?.find(
          (v) => v.id === options.variant || filterState.variantId
        );
        pdfData = applyOnePageSelection(
          pdfData,
          variant?.maxBulletsPerRole || options.maxBulletsPerRole
        );
      }

      // Call API to generate PDF
      const response = await fetch("/api/resume/export-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resumeData: pdfData,
          options,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }

      // Download file (PDF or HTML depending on implementation)
      const contentType = response.headers.get("content-type");
      const isPDF = contentType?.includes("application/pdf");
      const extension = isPDF ? "pdf" : "html";

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resume-${options.variant || "default"}-${options.format}-${new Date().toISOString().split("T")[0]}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export PDF. Please try again.");
    }
  };

  const renderSection = (sectionKey: ResumeSectionKey) => {
    if (!filterState.sections[sectionKey]) return null;

    switch (sectionKey) {
      case "summary":
        return <SummarySection key="summary" summary={filteredData.summary} />;
      case "experience":
        return (
          <ExperienceSection
            key="experience"
            experience={filteredData.experience}
          />
        );
      case "skills":
        return <SkillsSection key="skills" skills={filteredData.skills} />;
      case "projects":
        return (
          <ProjectsSection key="projects" projects={filteredData.projects} />
        );
      case "education":
        return (
          <EducationSection
            key="education"
            education={filteredData.education}
          />
        );
      case "certifications":
        // Render combined section for certifications (only once)
        if (
          filterState.sections.certifications ||
          filterState.sections.awards
        ) {
          return (
            <CertificationsAndAwardsSection
              key="certifications-awards"
              certifications={
                filterState.sections.certifications
                  ? filteredData.certifications
                  : undefined
              }
              awards={
                filterState.sections.awards ? filteredData.awards : undefined
              }
            />
          );
        }
        return null;
      case "awards":
        // Skip rendering here if certifications is also selected (already rendered above)
        if (filterState.sections.certifications) {
          return null;
        }
        // Only render if awards is selected but certifications is not
        if (filterState.sections.awards) {
          return (
            <CertificationsAndAwardsSection
              key="certifications-awards"
              certifications={undefined}
              awards={filteredData.awards}
            />
          );
        }
        return null;
      case "languages":
        return (
          <LanguagesSection
            key="languages"
            languages={filteredData.languages}
          />
        );
      default:
        return null;
    }
  };

  const hasVisibleSections = Object.values(filterState.sections).some(
    (visible) => visible
  );

  return (
    <div className="min-h-screen relative">
      <BackgroundGradient className="fixed inset-0 -z-10" />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Filter Panel */}
          <div className="lg:col-span-1">
            <div className="space-y-4">
              <FilterPanel
                resumeData={resumeData}
                filterState={filterState}
                onFilterChange={setFilterState}
              />
              <PDFExportButton
                filterState={filterState}
                variantId={filterState.variantId}
                onExport={handleExport}
              />
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="bg-background/80 backdrop-blur-sm rounded-lg p-6 shadow-lg">
              <ResumeHeader personalInfo={filteredData.personalInfo} />

              {hasVisibleSections ? (
                <div className="space-y-8">
                  {sectionOrder.map((sectionKey) =>
                    renderSection(sectionKey as ResumeSectionKey)
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-lg">No sections selected</p>
                  <p className="text-sm mt-2">
                    Use the filter panel to show resume sections
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
