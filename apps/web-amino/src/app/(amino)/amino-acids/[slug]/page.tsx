import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";

const CONTENT = path.join(process.cwd(), "content", "amino-acids");

export async function generateStaticParams() {
  return fs.readdirSync(CONTENT)
    .filter(f => /\.mdx?$/.test(f))
    .map(f => ({ slug: f.replace(/\.mdx?$/, "") }));
}

export default function Page({ params }: { params: { slug: string } }) {
  const file = path.join(CONTENT, `${params.slug}.mdx`);
  if (!fs.existsSync(file)) return notFound();
  const raw = fs.readFileSync(file, "utf8");
  const { content, data } = matter(raw);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-semibold mb-2">{data.title ?? params.slug}</h1>
      {data.subtitle ? <p className="opacity-70 mb-6">{data.subtitle}</p> : null}
      <article className="prose dark:prose-invert">
        {/* @ts-expect-error RSC MDX */}
        <MDXRemote source={content} />
      </article>
    </main>
  );
}