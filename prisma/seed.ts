/**
 * Database Seed Script
 * 
 * Populates database with:
 * - Default admin user
 * - Default storage configuration (Cloudflare R2)
 * - System templates
 * - Starter content
 */

import { PrismaClient } from "../lib/database/generated/prisma";
import { hash } from "bcryptjs";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// Load environment variables
import { config } from "dotenv";
config({ path: ".env.local" });
config(); // Fallback to .env

// Initialize Prisma client with pg adapter (Prisma 7 requirement)
const databaseUrl = process.env.DATABASE_URL || "";
const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ============================================================
// SEED DATA
// ============================================================

const WELCOME_TIPTAP_JSON = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [
        {
          type: "text",
          text: "Welcome to Digital Garden",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Welcome to your new Digital Garden! This is a powerful, Obsidian-inspired knowledge management system.",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [
        {
          type: "text",
          text: "Getting Started",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "Create notes:",
                },
                {
                  type: "text",
                  text: " Click the + button in the file tree or use Cmd+N",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "Organize with folders:",
                },
                {
                  type: "text",
                  text: " Drag and drop to reorganize your content",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "Upload files:",
                },
                {
                  type: "text",
                  text: " Drag files directly into folders",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  marks: [{ type: "bold" }],
                  text: "Use the command palette:",
                },
                {
                  type: "text",
                  text: " Press Cmd+K to access all commands",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [
        {
          type: "text",
          text: "Features",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "📝 Rich text editor with markdown support",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "📁 Hierarchical file organization",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "🔍 Full-text search across all content",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "🔗 Backlinks and bidirectional linking",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "☁️ Multi-cloud storage support",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Happy writing! 🌱",
        },
      ],
    },
  ],
};

const EMAIL_TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ subject }}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #2c3e50;
      margin-bottom: 20px;
    }
    .preheader {
      color: #7f8c8d;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .content {
      margin-bottom: 30px;
    }
    .footer {
      text-align: center;
      color: #7f8c8d;
      font-size: 12px;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ecf0f1;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>{{ subject }}</h1>
    {% if preheader %}
    <p class="preheader">{{ preheader }}</p>
    {% endif %}
    <div class="content">
      {% for section in sections %}
      {{ section | safe }}
      {% endfor %}
    </div>
    <div class="footer">
      <p>© 2026 Digital Garden. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

// ============================================================
// SEED FUNCTIONS
// ============================================================

async function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

async function seedUser() {
  const user = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      username: "admin",
      email: "admin@example.com",
      passwordHash: await hashPassword("changeme123"),
      role: "owner",
    },
  });
  
  console.log("✅ Created user:", user.email);
  return user;
}

async function seedStorageConfig(userId: string) {
  const config = await prisma.storageProviderConfig.upsert({
    where: {
      userId_provider: {
        userId,
        provider: "r2",
      },
    },
    update: {},
    create: {
      userId,
      provider: "r2",
      isDefault: true,
      displayName: "Cloudflare R2",
      config: {
        accountId: process.env.R2_ACCOUNT_ID || "placeholder",
        accessKeyId: process.env.R2_ACCESS_KEY_ID || "placeholder",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "placeholder",
        bucket: process.env.R2_BUCKET || "digital-garden",
        endpoint: process.env.R2_ENDPOINT || "https://placeholder.r2.cloudflarestorage.com",
      },
    },
  });
  
  console.log("✅ Created storage config:", config.provider);
  return config;
}

async function seedTemplates(userId: string) {
  // Check if template already exists
  const existing = await prisma.contentNode.findFirst({
    where: {
      ownerId: userId,
      slug: "template-email-newsletter",
    },
  });
  
  if (existing) {
    console.log("⏭️  Template already exists, skipping");
    return existing;
  }
  
  const template = await prisma.contentNode.create({
    data: {
      ownerId: userId,
      title: "Email Newsletter Template",
      slug: "template-email-newsletter",
      isPublished: false,
      htmlPayload: {
        create: {
          html: EMAIL_TEMPLATE_HTML,
          searchText: "email newsletter template responsive marketing announcements",
          isTemplate: true,
          templateSchema: {
            params: [
              { name: "subject", type: "string", required: true },
              { name: "preheader", type: "string", required: false },
              { name: "sections", type: "array", items: "html" },
            ],
          },
          templateMetadata: {
            description: "Responsive email newsletter template",
            useCases: ["marketing", "announcements"],
            tags: ["email", "newsletter"],
            version: "1.0",
          },
          renderMode: "template",
          templateEngine: "nunjucks",
        },
      },
    },
  });
  
  console.log("✅ Created template:", template.title);
  return template;
}

async function seedStarterContent(userId: string) {
  // Check if welcome note already exists
  const existing = await prisma.contentNode.findFirst({
    where: {
      ownerId: userId,
      slug: "welcome",
    },
  });
  
  if (existing) {
    console.log("⏭️  Welcome note already exists, skipping");
    return existing;
  }
  
  const welcomeNote = await prisma.contentNode.create({
    data: {
      ownerId: userId,
      title: "Welcome to Digital Garden",
      slug: "welcome",
      isPublished: true,
      notePayload: {
        create: {
          tiptapJson: WELCOME_TIPTAP_JSON,
          searchText: "Welcome to Digital Garden knowledge management system getting started create notes organize folders upload files command palette rich text editor markdown support hierarchical file organization full-text search backlinks bidirectional linking multi-cloud storage",
          metadata: {
            wordCount: 95,
            readingTime: 1,
          },
        },
      },
    },
  });
  
  console.log("✅ Created welcome note:", welcomeNote.title);
  return welcomeNote;
}

async function seedTags(userId: string) {
  // Sample tags with colors
  const sampleTags = [
    { name: "tutorial", slug: "tutorial", color: "#3b82f6" }, // blue
    { name: "reference", slug: "reference", color: "#8b5cf6" }, // purple
    { name: "project", slug: "project", color: "#10b981" }, // green
    { name: "idea", slug: "idea", color: "#f59e0b" }, // amber
    { name: "todo", slug: "todo", color: "#ef4444" }, // red
    { name: "archive", slug: "archive", color: "#6b7280" }, // gray
  ];

  const tags = [];

  for (const tagData of sampleTags) {
    const tag = await prisma.tag.upsert({
      where: {
        userId_slug: {
          userId,
          slug: tagData.slug,
        },
      },
      update: {},
      create: {
        userId,
        name: tagData.name,
        slug: tagData.slug,
        color: tagData.color,
      },
    });

    tags.push(tag);
  }

  console.log(`✅ Created ${tags.length} sample tags`);
  return tags;
}

// ============================================================
// MAIN SEED FUNCTION
// ============================================================

async function main() {
  console.log("🌱 Seeding database...\n");
  
  try {
    // 1. Create default user
    const user = await seedUser();
    
    // 2. Create default storage config
    await seedStorageConfig(user.id);
    
    // 3. Create system templates
    await seedTemplates(user.id);
    
    // 4. Create starter content
    await seedStarterContent(user.id);

    // 5. Create sample tags
    await seedTags(user.id);

    console.log("\n✨ Seed complete!");
    console.log("\n📋 Login credentials:");
    console.log("   Email: admin@example.com");
    console.log("   Password: changeme123");
    console.log("\n⚠️  Change default password after first login!");
  } catch (error) {
    console.error("\n❌ Seed failed:", error);
    throw error;
  }
}

// ============================================================
// RUN SEED
// ============================================================

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

