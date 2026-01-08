import type { ResumeBullet, ResumeData } from "./types";

/**
 * Calculate composite score for a bullet
 * Formula: (impactScore * 0.6) + (relevanceScore * 0.4)
 */
export function calculateCompositeScore(bullet: ResumeBullet): number {
  const impactScore = bullet.impactScore ?? 0;
  const relevanceScore = bullet.relevanceScore ?? 0;

  // If no scores provided, use priority as fallback
  if (impactScore === 0 && relevanceScore === 0) {
    return bullet.visibility?.priority ?? 0;
  }

  return impactScore * 0.6 + relevanceScore * 0.4;
}

/**
 * Rank bullets by composite score (descending)
 */
export function rankBulletsByScore(bullets: ResumeBullet[]): ResumeBullet[] {
  return [...bullets].sort((a, b) => {
    const scoreA = calculateCompositeScore(a);
    const scoreB = calculateCompositeScore(b);

    // If scores are equal, fallback to priority
    if (scoreA === scoreB) {
      const priorityA = a.visibility?.priority ?? 0;
      const priorityB = b.visibility?.priority ?? 0;
      return priorityB - priorityA;
    }

    return scoreB - scoreA;
  });
}

/**
 * Select top N bullets per role for 1-page PDF
 */
export function selectTopBulletsForOnePage(
  experience: ResumeData["experience"],
  maxBulletsPerRole?: number
): ResumeData["experience"] {
  const defaultMax = maxBulletsPerRole ?? 3;

  return experience.map((exp) => {
    const rankedBullets = rankBulletsByScore(exp.bullets);
    const selectedBullets = rankedBullets.slice(0, defaultMax);

    return {
      ...exp,
      bullets: selectedBullets,
    };
  });
}

/**
 * Select top bullets for projects (for 1-page PDF)
 */
export function selectTopProjectBullets(
  projects: ResumeData["projects"] = [],
  maxBulletsPerProject: number = 2
): ResumeData["projects"] {
  return projects.map((project) => {
    const rankedBullets = rankBulletsByScore(project.bullets);
    const selectedBullets = rankedBullets.slice(0, maxBulletsPerProject);

    return {
      ...project,
      bullets: selectedBullets,
    };
  });
}

/**
 * Apply scoring-based selection for 1-page PDF export
 */
export function applyOnePageSelection(
  resumeData: ResumeData,
  maxBulletsPerRole?: number
): ResumeData {
  return {
    ...resumeData,
    experience: selectTopBulletsForOnePage(
      resumeData.experience,
      maxBulletsPerRole
    ),
    projects: selectTopProjectBullets(resumeData.projects, 2),
  };
}

