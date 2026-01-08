import type { ResumeData } from "../types";

export const resumeData: ResumeData = {
  meta: {
    version: "1.0.0",
    defaultVariantId: "software-engineer",
    canonicalOrder: [
      "summary",
      "experience",
      "skills",
      "projects",
      "education",
      "certifications",
      "awards",
      "languages",
    ],
  },

  personalInfo: {
    name: "David Valentine",
    headline: "Full-Stack Software Engineer",
    location: {
      city: "Greater St. George Area",
      region: "UT",
      country: "USA",
      remoteType: "remote",
    },
    email: "davidvalentine.dev@gmail.com",
    phone: "+1 (801) 839-6011",
    links: [
      { label: "Website", url: "https://digitalgarden.dev" },
      {
        label: "LinkedIn",
        url: "https://linkedin.com/in/david-valentine-554034226",
      },
      { label: "GitHub", url: "https://github.com/centervalentine" },
    ],
  },

  summary: {
    id: "summary-1",
    paragraphs: [
      "Passionate full-stack engineer with expertise in building scalable web applications and developer tools. Specialized in TypeScript, React, and modern cloud architectures.",
    ],
    highlights: [
      {
        id: "highlight-1",
        text: "Led development of platform serving 100K+ users with 99.9% uptime",
        impactScore: 95,
        relevanceScore: 90,
        impactTags: ["scale", "reliability"],
        keywords: ["TypeScript", "React", "Node.js"],
      },
      {
        id: "highlight-2",
        text: "Reduced API response times by 60% through optimization and caching strategies",
        impactScore: 90,
        relevanceScore: 85,
        impactTags: ["performance"],
        keywords: ["PostgreSQL", "Redis", "CI/CD"],
      },
    ],
    visibility: {
      include: true,
      includeInPdf: true,
      includeOnWeb: true,
    },
  },

  experience: [
    {
      id: "exp-1",
      company: "Tech Corp",
      position: "Senior Software Engineer",
      location: {
        city: "San Francisco",
        region: "CA",
        country: "USA",
        remoteType: "hybrid",
      },
      employmentType: "full-time",
      dateRange: {
        start: "2023-01-15",
        isCurrent: true,
      },
      teamOrOrg: "Platform Engineering",
      domain: ["fintech", "e-commerce"],
      technologies: ["TypeScript", "React", "Next.js", "PostgreSQL", "AWS"],
      bullets: [
        {
          id: "exp-1-bullet-1",
          text: "Architected and implemented microservices platform handling 10M+ requests daily",
          impactScore: 95,
          relevanceScore: 90,
          impactTags: ["scale", "architecture"],
          keywords: ["TypeScript", "Node.js", "AWS"],
        },
        {
          id: "exp-1-bullet-2",
          text: "Led team of 5 engineers to deliver critical payment processing system ahead of schedule",
          impactScore: 85,
          relevanceScore: 80,
          impactTags: ["leadership", "delivery"],
          keywords: ["PostgreSQL", "React"],
        },
        {
          id: "exp-1-bullet-3",
          text: "Reduced deployment time by 40% through CI/CD pipeline optimization",
          impactScore: 80,
          relevanceScore: 75,
          impactTags: ["performance", "cost"],
          keywords: ["CI/CD", "Docker", "Kubernetes"],
        },
        {
          id: "exp-1-bullet-4",
          text: "Mentored junior developers and established code review best practices",
          impactScore: 70,
          relevanceScore: 65,
          impactTags: ["leadership"],
          keywords: [],
        },
      ],
      visibility: {
        include: true,
        includeInPdf: true,
        includeOnWeb: true,
      },
    },
    {
      id: "exp-2",
      company: "StartupXYZ",
      position: "Full-Stack Developer",
      location: {
        city: "Remote",
        remoteType: "remote",
      },
      employmentType: "full-time",
      dateRange: {
        start: "2021-03-01",
        end: "2022-12-31",
      },
      domain: ["SaaS", "developer-tools"],
      technologies: ["TypeScript", "React", "Node.js", "MongoDB"],
      bullets: [
        {
          id: "exp-2-bullet-1",
          text: "Built customer-facing dashboard increasing user engagement by 35%",
          impactScore: 85,
          relevanceScore: 85,
          impactTags: ["performance", "user-experience"],
          keywords: ["React", "TypeScript"],
        },
        {
          id: "exp-2-bullet-2",
          text: "Implemented real-time features using WebSockets supporting 5K concurrent connections",
          impactScore: 80,
          relevanceScore: 80,
          impactTags: ["scale", "reliability"],
          keywords: ["Node.js", "WebSockets"],
        },
        {
          id: "exp-2-bullet-3",
          text: "Designed and developed RESTful API serving mobile and web clients",
          impactScore: 75,
          relevanceScore: 75,
          impactTags: ["architecture"],
          keywords: ["Node.js", "MongoDB"],
        },
      ],
      visibility: {
        include: true,
        includeInPdf: true,
        includeOnWeb: true,
      },
    },
    {
      id: "exp-3",
      company: "Dev Agency",
      position: "Software Engineer",
      employmentType: "full-time",
      dateRange: {
        start: "2019-06-01",
        end: "2021-02-28",
      },
      domain: ["consulting", "web-development"],
      technologies: ["JavaScript", "React", "Python", "Django"],
      bullets: [
        {
          id: "exp-3-bullet-1",
          text: "Developed custom web applications for 15+ clients across various industries",
          impactScore: 70,
          relevanceScore: 70,
          impactTags: ["delivery"],
          keywords: ["React", "Python", "Django"],
        },
        {
          id: "exp-3-bullet-2",
          text: "Collaborated with design team to implement pixel-perfect UI components",
          impactScore: 65,
          relevanceScore: 70,
          impactTags: ["user-experience"],
          keywords: ["React", "CSS"],
        },
      ],
      visibility: {
        include: true,
        includeInPdf: true,
        includeOnWeb: true,
      },
    },
  ],

  projects: [
    {
      id: "proj-1",
      name: "Digital Garden Platform",
      role: "Solo",
      dateRange: {
        start: "2024-01-01",
        isCurrent: true,
      },
      links: [
        { label: "Live Demo", url: "https://digitalgarden.example.com" },
        {
          label: "GitHub",
          url: "https://github.com/davidvalentine/digital-garden",
        },
      ],
      technologies: ["Next.js", "TypeScript", "Prisma", "PostgreSQL"],
      bullets: [
        {
          id: "proj-1-bullet-1",
          text: "Built knowledge management system with hierarchical document organization",
          impactScore: 80,
          relevanceScore: 85,
          impactTags: ["architecture"],
          keywords: ["Next.js", "TypeScript", "Prisma"],
        },
        {
          id: "proj-1-bullet-2",
          text: "Implemented dynamic navigation system with role-based access control",
          impactScore: 75,
          relevanceScore: 80,
          impactTags: ["architecture", "security"],
          keywords: ["PostgreSQL", "TypeScript"],
        },
      ],
      visibility: {
        include: true,
        includeInPdf: true,
        includeOnWeb: true,
      },
    },
    {
      id: "proj-2",
      name: "Open Source CLI Tool",
      role: "Lead",
      dateRange: {
        start: "2023-06-01",
        end: "2023-12-31",
      },
      links: [
        { label: "GitHub", url: "https://github.com/davidvalentine/cli-tool" },
      ],
      technologies: ["TypeScript", "Node.js"],
      bullets: [
        {
          id: "proj-2-bullet-1",
          text: "Created developer tool with 500+ GitHub stars and active community",
          impactScore: 75,
          relevanceScore: 70,
          impactTags: ["community"],
          keywords: ["TypeScript", "Node.js"],
        },
      ],
      visibility: {
        include: true,
        includeInPdf: true,
        includeOnWeb: true,
      },
    },
  ],

  skills: {
    items: [
      {
        name: "TypeScript",
        aliases: ["TS", "typescript"],
        category: "languages",
        proficiency: "advanced",
        years: 5,
      },
      {
        name: "JavaScript",
        aliases: ["JS", "javascript"],
        category: "languages",
        proficiency: "advanced",
        years: 7,
      },
      {
        name: "React",
        aliases: ["React.js"],
        category: "frameworks",
        proficiency: "advanced",
        years: 6,
      },
      {
        name: "Next.js",
        aliases: ["nextjs", "next"],
        category: "frameworks",
        proficiency: "proficient",
        years: 3,
      },
      {
        name: "Node.js",
        aliases: ["node"],
        category: "frameworks",
        proficiency: "advanced",
        years: 5,
      },
      {
        name: "PostgreSQL",
        aliases: ["Postgres", "postgresql"],
        category: "databases",
        proficiency: "proficient",
        years: 4,
      },
      {
        name: "MongoDB",
        category: "databases",
        proficiency: "proficient",
        years: 3,
      },
      {
        name: "AWS",
        aliases: ["Amazon Web Services"],
        category: "cloud",
        proficiency: "proficient",
        years: 3,
      },
      {
        name: "Docker",
        category: "tools",
        proficiency: "proficient",
        years: 4,
      },
      {
        name: "Kubernetes",
        aliases: ["k8s"],
        category: "tools",
        proficiency: "familiar",
        years: 2,
      },
      {
        name: "CI/CD",
        aliases: ["continuous integration", "continuous deployment"],
        category: "practices",
        proficiency: "proficient",
        years: 4,
      },
      {
        name: "Git",
        category: "tools",
        proficiency: "advanced",
        years: 7,
      },
    ],
    featured: ["TypeScript", "React", "Next.js", "Node.js"],
    visibility: {
      include: true,
      includeInPdf: true,
      includeOnWeb: true,
    },
  },

  education: [
    {
      id: "edu-1",
      institution: "University of California, Berkeley",
      degree: "BS",
      field: "Computer Science",
      location: {
        city: "Berkeley",
        region: "CA",
        country: "USA",
      },
      dateRange: {
        start: "2015-09-01",
        end: "2019-05-31",
      },
      gpa: "3.8",
      honors: ["Dean's List", "Summa Cum Laude"],
      coursework: [
        "Data Structures and Algorithms",
        "Database Systems",
        "Software Engineering",
        "Distributed Systems",
      ],
      visibility: {
        include: true,
        includeInPdf: true,
        includeOnWeb: true,
      },
    },
  ],

  certifications: [
    {
      id: "cert-1",
      name: "AWS Certified Solutions Architect",
      issuer: "Amazon Web Services",
      date: "2023-06-15",
      expiryDate: "2026-06-15",
      credentialId: "AWS-CSA-12345",
      url: "https://aws.amazon.com/verification",
      visibility: {
        include: true,
        includeInPdf: true,
        includeOnWeb: true,
      },
    },
    {
      id: "cert-2",
      name: "Google Cloud Professional Developer",
      issuer: "Google Cloud",
      date: "2022-03-20",
      expiryDate: "2025-03-20",
      credentialId: "GCP-PD-67890",
      visibility: {
        include: true,
        includeInPdf: true,
        includeOnWeb: true,
      },
    },
  ],

  awards: [
    {
      id: "award-1",
      title: "Employee of the Year",
      issuer: "Tech Corp",
      date: "2023-12-31",
      description:
        "Recognized for outstanding contributions to platform architecture",
      visibility: {
        include: true,
        includeInPdf: true,
        includeOnWeb: true,
      },
    },
    {
      id: "award-2",
      title: "Hackathon Winner",
      issuer: "Tech Conference 2022",
      date: "2022-09-15",
      description: "First place in 48-hour hackathon with team of 4",
      visibility: {
        include: true,
        includeInPdf: false,
        includeOnWeb: true,
      },
    },
  ],

  languages: [
    {
      language: "English",
      proficiency: "native",
      visibility: {
        include: true,
        includeInPdf: true,
        includeOnWeb: true,
      },
    },
    {
      language: "Spanish",
      proficiency: "conversational",
      visibility: {
        include: true,
        includeInPdf: false,
        includeOnWeb: true,
      },
    },
  ],

  variants: [
    {
      id: "software-engineer",
      label: "Software Engineer",
      targetRole: "Full-Stack Software Engineer",
      includeTags: [],
      excludeTags: [],
      featuredSkills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
      sectionOrder: [
        "summary",
        "experience",
        "skills",
        "projects",
        "education",
        "certifications",
      ],
      maxBulletsPerRole: 3,
    },
    {
      id: "frontend",
      label: "Frontend Engineer",
      targetRole: "Frontend Software Engineer",
      includeTags: ["React", "TypeScript", "UI"],
      excludeTags: ["backend", "infrastructure"],
      featuredSkills: ["React", "TypeScript", "Next.js"],
      sectionOrder: [
        "summary",
        "experience",
        "skills",
        "projects",
        "education",
      ],
      maxBulletsPerRole: 4,
    },
    {
      id: "backend",
      label: "Backend Engineer",
      targetRole: "Backend Software Engineer",
      includeTags: ["API", "database", "infrastructure"],
      excludeTags: ["frontend", "UI"],
      featuredSkills: ["Node.js", "PostgreSQL", "AWS"],
      sectionOrder: [
        "summary",
        "experience",
        "skills",
        "projects",
        "education",
        "certifications",
      ],
      maxBulletsPerRole: 4,
    },
  ],
};
