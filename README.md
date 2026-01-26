# Digital Garden - Content IDE

A modern, Obsidian-inspired knowledge management system built with Next.js 16. Combines rich text editing, multi-cloud storage, hierarchical file organization, and an elegant glass-morphism UI.

## Features

### Core Functionality
- **Panel-Based Layout** - Resizable left/right sidebars with persistent state
- **Rich Text Editor** - TipTap-powered editor with markdown shortcuts, tables, code blocks
- **File Tree** - Drag-and-drop file organization with react-arborist
- **Multi-Cloud Storage** - Support for Cloudflare R2, AWS S3, and Vercel Blob
- **Search & Tags** - Full-text search with tag filtering and backlink tracking
- **Custom Extensions** - Wiki-links `[[Note Title]]`, callouts, slash commands, task lists

### Content Types
- **Notes** - Rich markdown content with TipTap JSON
- **Files** - Images, PDFs, videos, audio, office documents
- **Code** - Syntax-highlighted code snippets (50+ languages)
- **HTML** - Rendered HTML content

### Design System
- **Liquid Glass** - Glass-morphism design with blur effects and semi-transparent surfaces
- **Unified Tokens** - Consistent design tokens for surfaces, intents, and motion
- **Dark Mode** - Full dark mode support via next-themes

## Tech Stack

### Framework & Core
- **Next.js 16.0.8** - App Router with React Server Components
- **React 19.2.1** - Latest React with concurrent features
- **TypeScript 5** - Strict mode type safety
- **Turbopack** - Fast development builds

### Database & ORM
- **PostgreSQL** - Primary database (Neon, local, or Prisma Postgres)
- **Prisma 7.2.0** - Type-safe database client with migrations
- **ContentNode v2.0** - Hybrid polymorphic content architecture

### UI & State
- **Tailwind CSS 4** - Utility-first styling with custom design tokens
- **Radix UI** - Accessible, unstyled component primitives
- **Zustand 5.0.2** - Lightweight state management with persistence
- **Allotment 1.20.3** - Resizable panel layout (3.2KB gzipped)
- **react-arborist 3.4.0** - Virtualized file tree with drag-and-drop

### Rich Text
- **TipTap 3.15.3** - Extensible rich text editor framework
- **lowlight 3.3.0** - Syntax highlighting (50+ languages)
- **Custom Extensions** - Wiki-links, callouts, slash commands, task lists

### Storage
- **@aws-sdk/client-s3** - S3 and R2 storage integration
- **@vercel/blob** - Vercel Blob storage
- **Multi-provider abstraction** - Unified API across storage backends

## Getting Started

### Prerequisites

- **Node.js 20+** - Required for Next.js 16
- **pnpm** - Package manager (or npm/yarn/bun)
- **PostgreSQL** - Database (local or cloud-hosted)

### Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd Digital-Garden

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your database URL and other credentials
```

### Environment Variables

Required variables for `.env.local`:

```bash
# Database
DATABASE_URL="postgresql://user:password@host:5432/database"

# Storage Encryption
STORAGE_ENCRYPTION_KEY="your-32-byte-hex-key-here"

# Optional: Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Optional: Storage Providers (configure at least one)
# Cloudflare R2
R2_ACCESS_KEY_ID="your-r2-access-key"
R2_SECRET_ACCESS_KEY="your-r2-secret-key"
R2_BUCKET_NAME="your-bucket-name"
R2_REGION="auto"
R2_ENDPOINT="https://your-account-id.r2.cloudflarestorage.com"

# AWS S3
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
AWS_BUCKET_NAME="your-bucket-name"
AWS_REGION="us-east-1"

# Vercel Blob
BLOB_READ_WRITE_TOKEN="your-vercel-blob-token"
```

### Database Setup

```bash
# 1. Generate Prisma client
npx prisma generate

# 2. Run migrations
npx prisma migrate deploy

# 3. (Optional) Seed test data
pnpm db:seed

# 4. (Optional) Open Prisma Studio to view data
npx prisma studio
```

### Development

```bash
# Start development server
pnpm dev

# Open http://localhost:3000
```

### Production Build

```bash
# Build for production
pnpm build

# Start production server
pnpm start
```

### Other Commands

```bash
# Run linter
pnpm lint

# Generate design tokens
pnpm build:tokens

# Database operations
pnpm db:seed              # Seed test data
npx prisma generate       # Regenerate Prisma client
npx prisma migrate dev    # Create new migration
npx prisma studio         # Open database GUI
```

## Project Structure

```
Digital-Garden/
├── app/                          # Next.js App Router
│   ├── (authenticated)/          # Protected routes
│   │   └── content/             # Content IDE routes
│   │       ├── page.tsx         # Main content IDE page
│   │       └── [id]/            # Individual content pages
│   ├── api/                     # API routes
│   │   └── content/             # Content API endpoints
│   │       ├── route.ts         # List/create content
│   │       ├── [id]/            # Individual content operations
│   │       ├── tree/            # Hierarchical tree
│   │       ├── upload/          # File upload (initiate/finalize)
│   │       ├── storage/         # Storage provider config
│   │       ├── search/          # Full-text search
│   │       ├── backlinks/       # Backlink tracking
│   │       └── tags/            # Tag management
│   └── globals.css              # Global styles + design tokens
├── components/
│   └── content/                 # Content IDE components
│       ├── headers/             # Panel headers
│       ├── left-sidebar/        # File tree, search
│       ├── right-sidebar/       # Outline, backlinks, tags
│       ├── editor/              # TipTap editor
│       └── viewers/             # File type viewers
├── lib/
│   ├── content/                 # Content utilities
│   │   ├── api-types.ts        # API type definitions
│   │   └── utils.ts            # Helper functions
│   ├── design-system/          # Design tokens
│   │   ├── surfaces.ts         # Glass-0/1/2 levels
│   │   ├── intents.ts          # Semantic colors
│   │   └── motion.ts           # Animation rules
│   ├── editor/                 # TipTap extensions
│   │   ├── extensions.ts       # Extension configs
│   │   ├── wiki-link-node.ts   # Wiki-link extension
│   │   ├── callout-extension.ts # Callout blocks
│   │   └── slash-commands.tsx  # Slash command menu
│   ├── storage/                # Storage providers
│   │   ├── factory.ts          # Provider factory
│   │   ├── r2-provider.ts      # Cloudflare R2
│   │   ├── s3-provider.ts      # AWS S3
│   │   └── vercel-provider.ts  # Vercel Blob
│   └── generated/
│       └── prisma/             # Generated Prisma client
├── stores/                      # Zustand state stores
│   ├── panel-store.ts          # Panel layout state
│   ├── content-store.ts        # Selected content state
│   ├── tree-state-store.ts     # Tree expand/collapse
│   ├── context-menu-store.ts   # Right-click menu
│   ├── editor-stats-store.ts   # Word count, reading time
│   └── outline-store.ts        # Document outline
├── prisma/
│   ├── schema.prisma           # Database schema
│   ├── migrations/             # Migration history
│   └── seed.ts                 # Seed script
├── docs/
│   └── notes-feature/          # Comprehensive documentation
│       ├── 00-index.md         # Documentation index
│       ├── 01-architecture.md  # System architecture
│       ├── 03-database-design.md # ContentNode v2.0
│       └── ...                 # 90+ documentation files
└── archive/                    # Archived applications
    ├── web-amino/              # Amino acid learning platform
    └── open-notes/             # Documentation repository
```

## Architecture Highlights

### ContentNode v2.0 - Hybrid Polymorphism

A single `ContentNode` table acts as a universal container for all content types. Each leaf node has exactly one typed payload relation:

- **NotePayload** - Rich text content (TipTap JSON + markdown)
- **FilePayload** - Binary files with storage metadata
- **HtmlPayload** - Rendered HTML content
- **CodePayload** - Code snippets with syntax highlighting

### Multi-Cloud Storage System

Provider abstraction layer supports multiple cloud storage backends with encrypted credential storage:

- **Cloudflare R2** - Primary (S3-compatible, no egress fees)
- **AWS S3** - Traditional cloud storage
- **Vercel Blob** - Vercel-native storage

### Server/Client Component Split

Maximizes server-side rendering for instant visual feedback, progressively enhances with client interactivity:

- **Server Components** - Panel headers, borders, layout structure, skeleton states
- **Client Components** - Interactive file tree, resizable panels, drag-and-drop handlers

### Design System - Liquid Glass

Three token categories generated via style-dictionary:

- **Surfaces** - Glass-0/1/2 blur levels for glassmorphism effects
- **Intents** - Semantic colors (primary, danger, success, warning, info)
- **Motion** - Conservative animation rules

## Documentation

Comprehensive documentation is available in [`docs/notes-feature/`](docs/notes-feature/):

- **[00-index.md](docs/notes-feature/00-index.md)** - Documentation index (start here)
- **[IMPLEMENTATION-STATUS.md](docs/notes-feature/IMPLEMENTATION-STATUS.md)** - Current milestone progress
- **[01-architecture.md](docs/notes-feature/01-architecture.md)** - System architecture
- **[03-database-design.md](docs/notes-feature/03-database-design.md)** - Database schema
- **[04-api-specification.md](docs/notes-feature/04-api-specification.md)** - API routes
- **[CLAUDE.md](CLAUDE.md)** - AI assistant development guide

See [`docs/notes-feature/00-index.md`](docs/notes-feature/00-index.md) for the complete documentation catalog (90+ files).

## Database Management

### Critical Rules

- ✅ Use `npx prisma db push` for development (fast, no data loss)
- ✅ Use `npx prisma migrate dev` only for production-ready changes
- ✅ Always run `npx prisma generate` after schema changes
- ❌ Never use `npx prisma migrate reset` in production (deletes all data!)

### Common Workflows

```bash
# Making schema changes in development
npx prisma db push          # Push changes directly (no migration file)
npx prisma generate         # Regenerate client

# Creating a production migration
npx prisma migrate dev --name descriptive_name --create-only
# Review SQL in prisma/migrations/
npx prisma migrate deploy   # Deploy to production

# Seeding test data
pnpm db:seed

# Viewing data
npx prisma studio           # Opens GUI at http://localhost:5555
```

See [`docs/notes-feature/PRISMA-DATABASE-GUIDE.md`](docs/notes-feature/PRISMA-DATABASE-GUIDE.md) for comprehensive database management guidance.

## Key Features

### Wiki-Links

Link between notes using `[[Note Title]]` or `[[slug|Display Text]]` syntax. Autocomplete suggests existing notes as you type.

### Callouts

Create Obsidian-style callouts with 6 types:

```markdown
> [!note] Title
> Content here

> [!tip] Pro Tip
> Helpful information

> [!warning] Watch Out
> Important warning

> [!danger] Critical
> Dangerous operation

> [!info] FYI
> Additional information

> [!success] Done
> Successful completion
```

### Slash Commands

Press `/` in the editor to open the command menu:

- Headings (H1-H3)
- Code blocks
- Tables
- Callouts
- Task lists
- Blockquotes
- Dividers

### Task Lists

Auto-format `- [ ]` to task lists:

```markdown
- [ ] Todo item
- [x] Completed item
```

### Drag-and-Drop Upload

Drag files directly into the file tree or editor to upload. Supports images, PDFs, office documents, videos, and audio.

## Deployment

### Vercel (Recommended)

```bash
# 1. Install Vercel CLI
pnpm add -g vercel

# 2. Link project
vercel link

# 3. Set environment variables
vercel env add DATABASE_URL
vercel env add STORAGE_ENCRYPTION_KEY
# ... add other variables

# 4. Deploy
vercel --prod
```

### Other Platforms

The application can be deployed to any platform supporting Next.js 16:

- **Docker** - See Next.js Docker documentation
- **AWS** - Use AWS Amplify or EC2
- **Railway** - One-click deployment
- **DigitalOcean** - App Platform

Ensure all environment variables are configured and database migrations are run before deployment.

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Read [`docs/notes-feature/00-index.md`](docs/notes-feature/00-index.md) for architecture overview
2. Check [`CLAUDE.md`](CLAUDE.md) for development patterns and conventions
3. Follow TypeScript strict mode (no `any` types)
4. Use inline SVG for server component icons (not `lucide-react`)
5. Test that server components render without JavaScript
6. Update documentation for any architectural changes

## License

[Your License Here]

## Acknowledgments

- **Obsidian** - Inspiration for the note-taking experience
- **Novel** - TipTap-based rich text editor
- **react-arborist** - Virtualized tree component
- **Radix UI** - Accessible component primitives
- **Vercel** - Hosting and deployment platform

## Support

For issues, questions, or feature requests, please open an issue on GitHub or contact the maintainers.

---

Built with ❤️ using Next.js 16 and React 19
