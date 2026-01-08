import type {
  ResumeData,
  ResumeBullet,
  VisibilityRule,
  ResumeSectionKey,
} from "./types";

export interface FilterState {
  sections: Record<ResumeSectionKey, boolean>;
  variantId?: string;
  tags: string[];
  priorityThreshold: number;
}

/**
 * Check if an item should be visible based on visibility rules
 */
export function isVisible(
  item: { visibility?: VisibilityRule },
  context: "web" | "pdf" = "web"
): boolean {
  const rule = item.visibility;
  if (!rule) return true;

  if (rule.include === false) return false;
  if (context === "pdf" && rule.includeInPdf === false) return false;
  if (context === "web" && rule.includeOnWeb === false) return false;

  return true;
}

/**
 * Check if a bullet matches tag filters
 */
export function bulletMatchesTags(
  bullet: ResumeBullet,
  tags: string[]
): boolean {
  if (tags.length === 0) return true;

  const bulletTags = [
    ...(bullet.impactTags || []),
    ...(bullet.keywords || []),
  ].map((t) => t.toLowerCase());

  const filterTags = tags.map((t) => t.toLowerCase());

  return filterTags.some((tag) => bulletTags.includes(tag));
}

/**
 * Check if a bullet matches variant rules
 */
export function bulletMatchesVariant(
  bullet: ResumeBullet,
  variant: NonNullable<ResumeData["variants"]>[number]
): boolean {
  // Check includeTags
  if (variant.includeTags && variant.includeTags.length > 0) {
    const bulletTags = [
      ...(bullet.impactTags || []),
      ...(bullet.keywords || []),
    ].map((t) => t.toLowerCase());

    const hasIncludeTag = variant.includeTags.some((tag) =>
      bulletTags.includes(tag.toLowerCase())
    );

    if (!hasIncludeTag) return false;
  }

  // Check excludeTags
  if (variant.excludeTags && variant.excludeTags.length > 0) {
    const bulletTags = [
      ...(bullet.impactTags || []),
      ...(bullet.keywords || []),
    ].map((t) => t.toLowerCase());

    const hasExcludeTag = variant.excludeTags.some((tag) =>
      bulletTags.includes(tag.toLowerCase())
    );

    if (hasExcludeTag) return false;
  }

  return true;
}

/**
 * Filter experience entries based on filter state
 */
export function filterExperience(
  experience: ResumeData["experience"],
  filterState: FilterState,
  variant?: NonNullable<ResumeData["variants"]>[number],
  context: "web" | "pdf" = "web"
): ResumeData["experience"] {
  return experience
    .filter((exp) => {
      // Check section visibility
      if (!filterState.sections.experience) return false;

      // Check visibility rules
      if (!isVisible(exp, context)) return false;

      // Filter bullets
      const filteredBullets = filterBullets(exp.bullets, filterState, variant);

      // Only include if there are visible bullets
      return filteredBullets.length > 0;
    })
    .map((exp) => ({
      ...exp,
      bullets: filterBullets(exp.bullets, filterState, variant),
    }));
}

/**
 * Filter bullets based on filter state and variant
 */
export function filterBullets(
  bullets: ResumeBullet[],
  filterState: FilterState,
  variant?: NonNullable<ResumeData["variants"]>[number]
): ResumeBullet[] {
  return bullets.filter((bullet) => {
    // Check priority threshold (bullets don't have visibility, skip this check)
    // Priority filtering is handled at the experience/project level

    // Check tag filters
    if (!bulletMatchesTags(bullet, filterState.tags)) {
      return false;
    }

    // Check variant rules
    if (variant && !bulletMatchesVariant(bullet, variant)) {
      return false;
    }

    return true;
  });
}

/**
 * Filter projects based on filter state
 */
export function filterProjects(
  projects: ResumeData["projects"] = [],
  filterState: FilterState,
  variant?: NonNullable<ResumeData["variants"]>[number],
  context: "web" | "pdf" = "web"
): ResumeData["projects"] {
  if (!filterState.sections.projects) return [];

  return projects
    .filter((project) => {
      if (!isVisible(project, context)) return false;

      const filteredBullets = filterBullets(
        project.bullets,
        filterState,
        variant
      );

      return filteredBullets.length > 0;
    })
    .map((project) => ({
      ...project,
      bullets: filterBullets(project.bullets, filterState, variant),
    }));
}

/**
 * Filter skills based on filter state and variant
 */
export function filterSkills(
  skills: ResumeData["skills"],
  filterState: FilterState,
  variant?: NonNullable<ResumeData["variants"]>[number],
  context: "web" | "pdf" = "web"
): ResumeData["skills"] {
  if (!filterState.sections.skills) {
    return { items: [], visibility: skills.visibility };
  }

  if (!isVisible(skills, context)) {
    return { items: [], visibility: skills.visibility };
  }

  let filteredItems = skills.items;

  // If variant has featuredSkills, prioritize them
  if (variant?.featuredSkills) {
    const featured = skills.items.filter((item) =>
      variant.featuredSkills!.includes(item.name)
    );
    const others = skills.items.filter(
      (item) => !variant.featuredSkills!.includes(item.name)
    );
    filteredItems = [...featured, ...others];
  }

  return {
    ...skills,
    items: filteredItems,
    featured: variant?.featuredSkills || skills.featured,
  };
}

/**
 * Filter education based on filter state
 */
export function filterEducation(
  education: ResumeData["education"],
  filterState: FilterState,
  context: "web" | "pdf" = "web"
): ResumeData["education"] {
  if (!filterState.sections.education) return [];

  return education.filter((edu) => isVisible(edu, context));
}

/**
 * Filter certifications based on filter state
 */
export function filterCertifications(
  certifications: ResumeData["certifications"] = [],
  filterState: FilterState,
  context: "web" | "pdf" = "web"
): ResumeData["certifications"] {
  if (!filterState.sections.certifications) return [];

  return certifications.filter((cert) => isVisible(cert, context));
}

/**
 * Filter awards based on filter state
 */
export function filterAwards(
  awards: ResumeData["awards"] = [],
  filterState: FilterState,
  context: "web" | "pdf" = "web"
): ResumeData["awards"] {
  if (!filterState.sections.awards) return [];

  return awards.filter((award) => isVisible(award, context));
}

/**
 * Filter languages based on filter state
 */
export function filterLanguages(
  languages: ResumeData["languages"] = [],
  filterState: FilterState,
  context: "web" | "pdf" = "web"
): ResumeData["languages"] {
  if (!filterState.sections.languages) return [];

  return languages.filter((lang) => isVisible(lang, context));
}

/**
 * Apply all filters to resume data
 */
export function applyFilters(
  resumeData: ResumeData,
  filterState: FilterState,
  context: "web" | "pdf" = "web"
): ResumeData {
  const variant = resumeData.variants?.find(
    (v) => v.id === filterState.variantId
  );

  return {
    ...resumeData,
    summary:
      filterState.sections.summary &&
      isVisible(resumeData.summary || {}, context)
        ? resumeData.summary
        : undefined,
    experience: filterExperience(
      resumeData.experience,
      filterState,
      variant,
      context
    ),
    projects: filterProjects(
      resumeData.projects,
      filterState,
      variant,
      context
    ),
    skills: filterSkills(resumeData.skills, filterState, variant, context),
    education: filterEducation(resumeData.education, filterState, context),
    certifications: filterCertifications(
      resumeData.certifications,
      filterState,
      context
    ),
    awards: filterAwards(resumeData.awards, filterState, context),
    languages: filterLanguages(resumeData.languages, filterState, context),
  };
}
