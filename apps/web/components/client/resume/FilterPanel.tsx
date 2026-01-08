"use client";

import React from "react";
import type { ResumeData, ResumeSectionKey } from "@/lib/resume/types";
import type { FilterState } from "@/lib/resume/filtering";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/client/ui/card";
import { Checkbox } from "@/components/client/ui/checkbox";
import { Label } from "@/components/client/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/client/ui/select";
import { Slider } from "@/components/client/ui/slider";
import { Badge } from "@/components/client/ui/badge";
import { Button } from "@/components/client/ui/button";
import { X } from "lucide-react";

interface FilterPanelProps {
  resumeData: ResumeData;
  filterState: FilterState;
  onFilterChange: (newState: FilterState) => void;
}

const SECTION_LABELS: Record<ResumeSectionKey, string> = {
  summary: "Summary",
  experience: "Experience",
  skills: "Skills",
  projects: "Projects",
  education: "Education",
  certifications: "Certifications",
  awards: "Awards",
  languages: "Languages",
};

export function FilterPanel({
  resumeData,
  filterState,
  onFilterChange,
}: FilterPanelProps) {
  // Extract all available tags from resume data
  const allTags = new Set<string>();
  resumeData.experience.forEach((exp) => {
    exp.bullets.forEach((bullet) => {
      bullet.impactTags?.forEach((tag) => allTags.add(tag));
      bullet.keywords?.forEach((keyword) => allTags.add(keyword));
    });
  });
  resumeData.projects?.forEach((project) => {
    project.bullets.forEach((bullet) => {
      bullet.impactTags?.forEach((tag) => allTags.add(tag));
      bullet.keywords?.forEach((keyword) => allTags.add(keyword));
    });
  });

  const availableTags = Array.from(allTags).sort();

  const handleSectionToggle = (section: ResumeSectionKey, checked: boolean) => {
    onFilterChange({
      ...filterState,
      sections: {
        ...filterState.sections,
        [section]: checked,
      },
    });
  };

  const handleSelectAll = () => {
    const allSections = Object.keys(SECTION_LABELS) as ResumeSectionKey[];
    const newSections = allSections.reduce(
      (acc, section) => {
        acc[section] = true;
        return acc;
      },
      {} as Record<ResumeSectionKey, boolean>
    );
    onFilterChange({
      ...filterState,
      sections: newSections,
    });
  };

  const handleDeselectAll = () => {
    const allSections = Object.keys(SECTION_LABELS) as ResumeSectionKey[];
    const newSections = allSections.reduce(
      (acc, section) => {
        acc[section] = false;
        return acc;
      },
      {} as Record<ResumeSectionKey, boolean>
    );
    onFilterChange({
      ...filterState,
      sections: newSections,
    });
  };

  const handleVariantChange = (variantId: string) => {
    onFilterChange({
      ...filterState,
      variantId: variantId === "none" ? undefined : variantId,
    });
  };

  const handleTagToggle = (tag: string) => {
    const newTags = filterState.tags.includes(tag)
      ? filterState.tags.filter((t: string) => t !== tag)
      : [...filterState.tags, tag];
    onFilterChange({
      ...filterState,
      tags: newTags,
    });
  };

  const handleRemoveTag = (tag: string) => {
    onFilterChange({
      ...filterState,
      tags: filterState.tags.filter((t: string) => t !== tag),
    });
  };

  const handlePriorityChange = (value: number[]) => {
    onFilterChange({
      ...filterState,
      priorityThreshold: value[0],
    });
  };

  const selectedVariant = resumeData.variants?.find(
    (v) => v.id === filterState.variantId
  );

  return (
    <Card className="sticky top-4">
      <CardHeader>
        <CardTitle>Filters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Section Filters */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-semibold">Sections</Label>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="h-7 text-xs"
              >
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeselectAll}
                className="h-7 text-xs"
              >
                None
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {(Object.keys(SECTION_LABELS) as ResumeSectionKey[]).map(
              (section) => (
                <div key={section} className="flex items-center space-x-2">
                  <Checkbox
                    id={`section-${section}`}
                    checked={filterState.sections[section]}
                    onCheckedChange={(checked) =>
                      handleSectionToggle(section, checked as boolean)
                    }
                  />
                  <Label
                    htmlFor={`section-${section}`}
                    className="text-sm font-normal cursor-pointer flex-1"
                  >
                    {SECTION_LABELS[section]}
                  </Label>
                </div>
              )
            )}
          </div>
        </div>

        {/* Variant Selector */}
        {resumeData.variants && resumeData.variants.length > 0 && (
          <div>
            <Label className="text-sm font-semibold mb-3 block">Variant</Label>
            <Select
              value={filterState.variantId || "none"}
              onValueChange={handleVariantChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select variant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (All Content)</SelectItem>
                {resumeData.variants.map((variant) => (
                  <SelectItem key={variant.id} value={variant.id}>
                    {variant.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedVariant && (
              <p className="text-xs text-muted-foreground mt-2">
                {selectedVariant.targetRole || selectedVariant.label}
              </p>
            )}
          </div>
        )}

        {/* Tag Filters */}
        {availableTags.length > 0 && (
          <div>
            <Label className="text-sm font-semibold mb-3 block">Tags</Label>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-md">
                {availableTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant={
                      filterState.tags.includes(tag) ? "default" : "outline"
                    }
                    className="cursor-pointer text-xs"
                    onClick={() => handleTagToggle(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              {filterState.tags.length > 0 && (
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground mb-1 block">
                    Active Tags:
                  </Label>
                  <div className="flex flex-wrap gap-1">
                    {filterState.tags.map((tag: string) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-xs cursor-pointer"
                        onClick={() => handleRemoveTag(tag)}
                      >
                        {tag}
                        <X className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Priority Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-sm font-semibold">Priority Threshold</Label>
            <span className="text-xs text-muted-foreground">
              {filterState.priorityThreshold}
            </span>
          </div>
          <Slider
            value={[filterState.priorityThreshold]}
            onValueChange={handlePriorityChange}
            min={0}
            max={100}
            step={1}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Show only items with priority ≥ {filterState.priorityThreshold}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
