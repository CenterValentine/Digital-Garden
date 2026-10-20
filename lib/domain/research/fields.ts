/**
 * Subject fields (client-safe): one vocabulary the box's `field:` token and
 * the scope picker share, mapped to each source's own classification —
 * OpenAlex's 26 fields (ASJC ids, verified against /fields 2026-10-16) and
 * Semantic Scholar's fields of study. Crossref has no field filter (greyed).
 *
 * Domain packs refine these (Biomedicine adds PubMed / trials; CS & ML adds
 * arXiv / OpenReview); the fields themselves work with the core sources.
 */

export interface ResearchFieldInfo {
  id: string;
  label: string;
  /** Picker group. */
  group: "Life & health" | "Physical sciences" | "Social sciences & humanities";
  /** OpenAlex field ids (`primary_topic.field.id`). */
  openalex: number[];
  /** Semantic Scholar `fieldsOfStudy` values. */
  s2: string[];
}

export const RESEARCH_FIELDS: ResearchFieldInfo[] = [
  { id: "biomedicine", label: "Biomedicine & health", group: "Life & health", openalex: [27, 13, 24, 30, 29, 35, 36], s2: ["Medicine", "Biology"] },
  { id: "biology", label: "Biology & agriculture", group: "Life & health", openalex: [11, 13, 34], s2: ["Biology", "Agricultural and Food Sciences"] },
  { id: "neuroscience", label: "Neuroscience & psychology", group: "Life & health", openalex: [28, 32], s2: ["Psychology", "Medicine"] },
  { id: "computer-science", label: "Computer science & ML", group: "Physical sciences", openalex: [17], s2: ["Computer Science"] },
  { id: "mathematics", label: "Mathematics", group: "Physical sciences", openalex: [26], s2: ["Mathematics"] },
  { id: "physics", label: "Physics & astronomy", group: "Physical sciences", openalex: [31], s2: ["Physics"] },
  { id: "chemistry", label: "Chemistry & materials", group: "Physical sciences", openalex: [16, 15, 25], s2: ["Chemistry", "Materials Science"] },
  { id: "engineering", label: "Engineering & energy", group: "Physical sciences", openalex: [22, 21], s2: ["Engineering"] },
  { id: "earth", label: "Earth & environment", group: "Physical sciences", openalex: [19, 23], s2: ["Geology", "Environmental Science", "Geography"] },
  { id: "social", label: "Social sciences", group: "Social sciences & humanities", openalex: [33, 18], s2: ["Sociology", "Political Science"] },
  { id: "economics", label: "Economics & business", group: "Social sciences & humanities", openalex: [20, 14], s2: ["Economics", "Business"] },
  { id: "humanities", label: "Arts & humanities", group: "Social sciences & humanities", openalex: [12], s2: ["Art", "History", "Philosophy", "Linguistics"] },
  { id: "education", label: "Education", group: "Social sciences & humanities", openalex: [33], s2: ["Education"] },
  { id: "law", label: "Law", group: "Social sciences & humanities", openalex: [33], s2: ["Law"] },
];

export function researchField(id: string | undefined | null): ResearchFieldInfo | undefined {
  return id ? RESEARCH_FIELDS.find((field) => field.id === id) : undefined;
}

export const FIELD_GROUPS = ["Life & health", "Physical sciences", "Social sciences & humanities"] as const;
