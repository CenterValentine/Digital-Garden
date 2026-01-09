David's digital garden is a launch pad for representing myself and all that I am and what I do. It incorpoates the following:

A web-based knowledge management system (inspired by Obsidian) that is optimized to extend and enhance my capabilities using the following features:

- Resizable sidebars
- Tab-based document interface
- Command pallet / keyboard shortcuts
- Right sidebar for backlinks, outline and metadata.

A graph/network of document relationships
Full-text search across notes and files

A hybrid content management system powered by Cloudflare R2 that allows upload of any document file type:

- Markdown notes.
- Code files.
- Office documents.
- Media files.
- Diagrams
- Archives
- and more...
- set to public/private

A simple postgres database powered by Neon/Vercel Prisma:

- 'StructuredDocument' A universal container for all content:
- FileMetadata: metadata for uploaded files (modeled seperately for type safety)
- A tagging system for categorizing content.
- Access control system.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
