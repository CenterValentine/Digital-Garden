import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import Link from "next/link";

const CONTENT = path.join(process.cwd(), "content", "amino-acids");

export default function Page() {
  const files = fs.readdirSync(CONTENT).filter(f => /\.mdx?$/.test(f));
  const items = files.map(f => {
    const slug = f.replace(/\.mdx?$/, "");
    const raw = fs.readFileSync(path.join(CONTENT, f), "utf8");
    const { data } = matter(raw);
    return { slug, ...data } as any;
  }).sort((a,b) => (a.title||a.slug).localeCompare(b.title||b.slug));

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-4xl font-bold mb-2">Amino Acids (20 + 1)</h1>
      <p className="opacity-70 mb-6">The 20 canonical amino acids plus selenocysteine.</p>
      <table className="w-full border-separate border-spacing-y-2">
        <thead className="text-left">
          <tr><th>Name</th><th>3-letter</th><th>1-letter</th><th>Class</th><th>Essential?</th></tr>
        </thead>
        <tbody>
          {items.map((x:any) => (
            <tr key={x.slug} className="align-top">
              <td><Link className="text-blue-600 hover:underline" href={`/amino-acids/${x.slug}`}>{x.title ?? x.slug}</Link></td>
              <td>{x.three ?? ""}</td>
              <td>{x.one ?? ""}</td>
              <td>{x.class ?? ""}</td>
              <td>{String(x.essential ?? "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}