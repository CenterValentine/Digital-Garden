/**
 * The scripture catalog — every corpus the reader knows about, across
 * traditions (client-safe).
 *
 * Inclusive by construction: tradition is a property of a corpus, never of
 * the code. The reader, highlights, links, search and speed reading are one
 * pipeline; a tradition joins by adding an adapter that yields the same
 * book → chapter → verse rows (lib/domain/scripture/adapters/).
 *
 * Status:
 *   "available" — an adapter exists; the owner can install it.
 *   "planned"   — source and licence vetted; adapter not written yet.
 *   "link"      — licence allows linking only; the entry opens the publisher.
 *
 * Licences are the constraint that decides status — see
 * SCRIPTURES-INTEGRATION-PLAN.md §R3 "Other traditions".
 */

import type { ScriptureCorpusInfo, ScriptureTradition } from "./types";

export interface ScriptureCatalogEntry extends Omit<ScriptureCorpusInfo, "verseCount" | "version"> {
  description: string;
  status: "available" | "planned" | "link";
  homepage?: string;
}

export const TRADITION_LABELS: Record<ScriptureTradition, string> = {
  lds: "Latter-day Saint",
  christian: "Christian",
  jewish: "Jewish",
  islamic: "Islamic",
  buddhist: "Buddhist",
  hindu: "Hindu",
  sikh: "Sikh",
  taoist: "Taoist",
  bahai: "Bahá'í",
};

export const LDS_CORPUS_ID = "lds-standard-works";

export const SCRIPTURE_CATALOG: ScriptureCatalogEntry[] = [
  {
    id: LDS_CORPUS_ID,
    tradition: "lds",
    // Named for the owner's usage (2026-09-30); the text is the standard works.
    title: "Gospel Library",
    description:
      "Old Testament (KJV), New Testament (KJV), Book of Mormon, Doctrine and Covenants, and Pearl of Great Price — the verse text of the current editions.",
    language: "en",
    sourceUrl: "https://github.com/bcbooks/scriptures-json",
    license: "Public domain text (CC0 compilation)",
    versification: "chapter-verse",
    status: "available",
    homepage: "https://www.churchofjesuschrist.org/study/scriptures",
  },
  {
    id: "christian-bsb",
    tradition: "christian",
    title: "Berean Standard Bible",
    description: "A modern English Bible (Protestant canon), dedicated to the public domain in 2023.",
    language: "en",
    sourceUrl: "https://ebible.org/Scriptures/details.php?id=engbsb",
    license: "Public domain",
    versification: "chapter-verse",
    status: "planned",
    homepage: "https://berean.bible",
  },
  {
    id: "christian-web-catholic",
    tradition: "christian",
    title: "World English Bible (with Deuterocanon)",
    description: "Public-domain English Bible including the Catholic and Orthodox deuterocanonical books.",
    language: "en",
    sourceUrl: "https://ebible.org/Scriptures/details.php?id=eng-web",
    license: "Public domain",
    versification: "chapter-verse",
    status: "planned",
    homepage: "https://worldenglish.bible",
  },
  {
    id: "jewish-tanakh-jps1917",
    tradition: "jewish",
    title: "Tanakh (JPS 1917) with Hebrew",
    description: "Torah, Nevi'im and Ketuvim — Hebrew text with the public-domain 1917 JPS translation, via Sefaria's open API.",
    language: "he+en",
    sourceUrl: "https://developers.sefaria.org",
    license: "Public domain (JPS 1917); Hebrew text CC-BY-SA",
    versification: "chapter-verse",
    status: "planned",
    homepage: "https://www.sefaria.org/texts/Tanakh",
  },
  {
    id: "islamic-quran-tanzil",
    tradition: "islamic",
    title: "The Qur'an (Arabic, Tanzil) with Pickthall",
    description: "The verified Tanzil Arabic text (verbatim, per its licence) with Pickthall's 1930 English translation.",
    language: "ar+en",
    sourceUrl: "https://tanzil.net/download/",
    license: "Tanzil text CC-BY 3.0 (unaltered); Pickthall public domain",
    versification: "surah-ayah",
    status: "planned",
    homepage: "https://quran.com",
  },
  {
    id: "buddhist-pali-sujato",
    tradition: "buddhist",
    title: "Pāli Canon — Sutta Piṭaka (Sujato)",
    description: "The early discourses in Bhikkhu Sujato's English translation, segment-aligned with the Pāli, from SuttaCentral's Bilara data.",
    language: "pi+en",
    sourceUrl: "https://github.com/suttacentral/bilara-data",
    license: "CC0",
    versification: "sutta-segment",
    status: "planned",
    homepage: "https://suttacentral.net",
  },
  {
    id: "hindu-gita-arnold",
    tradition: "hindu",
    title: "Bhagavad Gita (Arnold, “The Song Celestial”)",
    description: "Edwin Arnold's 1885 verse translation, chapter and verse numbered.",
    language: "en",
    sourceUrl: "https://www.gutenberg.org/ebooks/2388",
    license: "Public domain",
    versification: "chapter-verse",
    status: "planned",
    homepage: "https://www.gutenberg.org/ebooks/2388",
  },
  {
    id: "sikh-sggs",
    tradition: "sikh",
    title: "Sri Guru Granth Sahib",
    description: "Gurmukhi text by Ang (page) and line, via BaniDB; English translations need publisher permission.",
    language: "pa",
    sourceUrl: "https://github.com/KhalisFoundation/banidb-api",
    license: "Gurmukhi public domain; translations by permission",
    versification: "section-verse",
    status: "planned",
    homepage: "https://www.sikhitothemax.org",
  },
  {
    id: "taoist-ttc-legge",
    tradition: "taoist",
    title: "Tao Te Ching (Legge)",
    description: "James Legge's 1891 translation, 81 chapters.",
    language: "en",
    sourceUrl: "https://www.gutenberg.org/ebooks/216",
    license: "Public domain",
    versification: "chapter-verse",
    status: "planned",
    homepage: "https://www.gutenberg.org/ebooks/216",
  },
  {
    id: "bahai-reference-library",
    tradition: "bahai",
    title: "Bahá'í Writings",
    description: "The Bahá'í Reference Library publishes the authoritative texts; its terms allow reading and linking, not bulk copying.",
    language: "en",
    sourceUrl: "https://www.bahai.org/library/",
    license: "© Bahá'í International Community — link only",
    versification: "chapter-verse",
    status: "link",
    homepage: "https://www.bahai.org/library/",
  },
];

export function catalogEntry(id: string): ScriptureCatalogEntry | null {
  return SCRIPTURE_CATALOG.find((entry) => entry.id === id) ?? null;
}
