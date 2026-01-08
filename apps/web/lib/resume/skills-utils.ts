import type { SkillItem } from "./types";

/**
 * Get canonical skill name (always use the official name)
 */
export function getCanonicalSkillName(
  skillName: string,
  skills: SkillItem[]
): string {
  // Try exact match first
  const exactMatch = skills.find(
    (s) => s.name.toLowerCase() === skillName.toLowerCase()
  );
  if (exactMatch) return exactMatch.name;

  // Try alias match
  const aliasMatch = skills.find((s) =>
    s.aliases?.some((alias) => alias.toLowerCase() === skillName.toLowerCase())
  );
  if (aliasMatch) return aliasMatch.name;

  // Return original if no match found
  return skillName;
}

/**
 * Check if a skill name matches (canonical or alias)
 */
export function skillNameMatches(
  skillName: string,
  skillItem: SkillItem
): boolean {
  const normalized = skillName.toLowerCase();
  if (skillItem.name.toLowerCase() === normalized) return true;
  return (
    skillItem.aliases?.some((alias) => alias.toLowerCase() === normalized) ??
    false
  );
}

/**
 * Group skills by category
 */
export function groupSkillsByCategory(
  skills: SkillItem[]
): Record<SkillItem["category"], SkillItem[]> {
  const grouped: Record<SkillItem["category"], SkillItem[]> = {
    languages: [],
    frameworks: [],
    databases: [],
    cloud: [],
    testing: [],
    tools: [],
    practices: [],
  };

  skills.forEach((skill) => {
    grouped[skill.category].push(skill);
  });

  return grouped;
}

/**
 * Get featured skills (prioritized for display)
 */
export function getFeaturedSkills(
  skills: SkillItem[],
  featuredNames: string[] = []
): SkillItem[] {
  if (featuredNames.length === 0) return skills;

  const featured: SkillItem[] = [];
  const others: SkillItem[] = [];

  skills.forEach((skill) => {
    if (featuredNames.includes(skill.name)) {
      featured.push(skill);
    } else {
      others.push(skill);
    }
  });

  return [...featured, ...others];
}

/**
 * Normalize technology names in bullets to canonical skill names
 */
export function normalizeTechnologies(
  technologies: string[],
  skills: SkillItem[]
): string[] {
  return technologies.map((tech) => getCanonicalSkillName(tech, skills));
}
