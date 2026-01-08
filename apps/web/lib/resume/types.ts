// Type definitions for resume data structure
// Recruiter-grade, ATS-optimized resume types

// Core Types
export type ISODate = string; // "2025-01-15"

export type ResumeSectionKey =
  | "summary"
  | "experience"
  | "skills"
  | "projects"
  | "education"
  | "certifications"
  | "awards"
  | "languages";

export type DateRange = {
  start: ISODate;
  end?: ISODate;
  isCurrent?: boolean;
};

export type Location = {
  city?: string;
  region?: string; // state/province
  country?: string;
  remoteType?: "onsite" | "hybrid" | "remote";
};

export type Link = {
  label: string;
  url: string;
};

// First-class bullet structure for ATS + filtering + scoring
export type ResumeBullet = {
  id: string;
  text: string; // ATS-safe plain text (no emojis, no fancy separators)
  impactTags?: string[]; // "performance", "cost", "reliability", "scale"
  keywords?: string[]; // "EF Core", "Postgres", "CI/CD" for filtering
  evidence?: { label: string; url?: string }; // optional proof link
  // Scoring system for automatic 1-page PDF selection
  impactScore?: number; // 0-100: quantifies impact (metrics, scale, business value)
  relevanceScore?: number; // 0-100: relevance to target role/variant
  // Computed total score = (impactScore * 0.6) + (relevanceScore * 0.4)
  // Higher scores = more likely to appear in space-constrained exports
};

// Visibility/targeting controls
export type VisibilityRule = {
  include?: boolean;
  includeInPdf?: boolean;
  includeOnWeb?: boolean;
  tags?: string[]; // used by filter UI
  priority?: number; // higher = more likely to show when tight on space
};

// Skills taxonomy (separate from display)
export type SkillItem = {
  name: string; // canonical: "TypeScript"
  aliases?: string[]; // "TS" for keyword matching
  category:
    | "languages"
    | "frameworks"
    | "databases"
    | "cloud"
    | "testing"
    | "tools"
    | "practices";
  proficiency?: "familiar" | "proficient" | "advanced";
  years?: number;
};

// Main Resume Data Structure
export interface ResumeData {
  meta?: {
    version?: string; // for schema/content versioning
    defaultVariantId?: string; // e.g., "software-engineer"
    canonicalOrder?: Array<ResumeSectionKey>;
  };

  personalInfo: {
    name: string;
    headline: string; // stronger than "title" (e.g., "Full-Stack Software Engineer")
    location?: Location;
    email: string;
    phone?: string; // optional for web, often included for PDF
    links?: Link[]; // website/linkedin/github/portfolio etc.
  };

  summary?: {
    id: string;
    paragraphs?: string[]; // ATS-safe; keep short
    highlights?: ResumeBullet[]; // 2–4 "proof bullets"
    visibility?: VisibilityRule;
  };

  experience: Array<{
    id: string;
    company: string;
    position: string;
    location?: Location;
    employmentType?:
      | "full-time"
      | "part-time"
      | "contract"
      | "internship"
      | "freelance";
    dateRange: DateRange;
    teamOrOrg?: string;
    domain?: string[]; // "e-learning", "logistics", "fintech"
    technologies?: string[]; // keep, but consider normalizing via SkillItem mapping
    bullets: ResumeBullet[]; // replaces description: string[]
    visibility?: VisibilityRule;
  }>;

  projects?: Array<{
    id: string;
    name: string;
    role?: string; // "Solo", "Team of 4", "Lead"
    dateRange?: DateRange;
    links?: Link[]; // live demo, github, case study
    technologies: string[];
    bullets: ResumeBullet[]; // better than single description
    visibility?: VisibilityRule;
  }>;

  skills: {
    items: SkillItem[]; // canonical skill store
    featured?: string[]; // names to emphasize for a given variant
    visibility?: VisibilityRule;
  };

  education: Array<{
    id: string;
    institution: string;
    degree: string; // "BS"
    field?: string;
    location?: Location;
    dateRange?: DateRange;
    gpa?: string;
    honors?: string[];
    coursework?: string[]; // optional, helpful for early-career targeting
    visibility?: VisibilityRule;
  }>;

  certifications?: Array<{
    id: string;
    name: string;
    issuer: string;
    date: ISODate;
    expiryDate?: ISODate;
    credentialId?: string;
    url?: string;
    visibility?: VisibilityRule;
  }>;

  awards?: Array<{
    id: string;
    title: string;
    issuer?: string;
    date?: ISODate;
    description?: string;
    visibility?: VisibilityRule;
  }>;

  languages?: Array<{
    language: string;
    proficiency: "basic" | "conversational" | "professional" | "native";
    visibility?: VisibilityRule;
  }>;

  variants?: Array<{
    id: string; // "software-engineer", "frontend", "backend"
    label: string;
    targetRole?: string;
    includeTags?: string[]; // used to auto-filter bullets/entries
    excludeTags?: string[];
    featuredSkills?: string[];
    sectionOrder?: Array<ResumeSectionKey>;
    maxBulletsPerRole?: number; // PDF-space control
  }>;
}

// PDF Export Options
export type PDFExportOptions = {
  format: "full" | "one-page" | "custom";
  variant?: string; // variant ID to apply
  sections?: string[]; // specific sections to include
  maxBulletsPerRole?: number; // custom limit (overrides variant setting)
  useScoring?: boolean; // use impact/relevance scores for selection (default: true)
  minScore?: number; // minimum composite score threshold
  includePhone?: boolean; // include phone in PDF (default: true for PDF, false for web)
  pageSize?: "A4" | "Letter";
  margins?: { top: number; right: number; bottom: number; left: number };
};
