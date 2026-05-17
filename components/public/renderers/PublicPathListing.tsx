/**
 * PublicPathListing — lists published items under a PublicPath.
 */

interface PublicItemCard {
  id: string;
  slug: string;
  publicTitle: string | null;
  payloadType: string;
  publicTags: string[];
  firstPublishedAt: Date | null;
  path: { slug: string; title: string };
  blogPostPayload: { excerpt: string | null; coverImageUrl: string | null } | null;
}

interface PathData {
  id: string | null;
  title: string;
  description?: string | null;
  slug: string;
  items: PublicItemCard[];
}

interface Props {
  publicPath: PathData;
}

export function PublicPathListing({ publicPath }: Props) {
  const { items } = publicPath;

  return (
    <main className="max-w-3xl mx-auto px-6 py-20">
      <header className="mb-12">
        <h1 className="text-3xl font-bold text-white mb-3">{publicPath.title}</h1>
        {publicPath.description && (
          <p className="text-lg text-white/50">{publicPath.description}</p>
        )}
      </header>

      {items.length === 0 ? (
        <p className="text-white/30 text-sm">No published content yet.</p>
      ) : (
        <div className="space-y-6">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}

function ItemCard({ item }: { item: PublicItemCard }) {
  const title = item.publicTitle ?? item.slug;
  const href = `/${item.path.slug}/${item.slug}`;
  const { blogPostPayload } = item;

  return (
    <a
      href={href}
      className="group flex flex-col gap-3 rounded-xl border border-white/8 bg-white/3 p-6 hover:border-white/15 hover:bg-white/5 transition-colors"
    >
      {blogPostPayload?.coverImageUrl && (
        <div
          className="w-full h-40 rounded-lg overflow-hidden bg-white/5"
          style={{
            backgroundImage: `url(${blogPostPayload.coverImageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}

      <div>
        <p className="text-[11px] uppercase tracking-wider text-white/30 mb-1.5">
          {item.payloadType.replace(/_/g, " ")}
        </p>
        <h2 className="text-lg font-semibold text-white group-hover:text-white/90 leading-snug">
          {title}
        </h2>
        {blogPostPayload?.excerpt && (
          <p className="mt-1.5 text-sm text-white/50 line-clamp-2 leading-relaxed">
            {blogPostPayload.excerpt}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {item.firstPublishedAt && (
          <time
            dateTime={item.firstPublishedAt.toISOString()}
            className="text-xs text-white/30"
          >
            {item.firstPublishedAt.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </time>
        )}
        {item.publicTags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 rounded-full text-[11px] bg-white/8 text-white/40 border border-white/8"
          >
            {tag}
          </span>
        ))}
      </div>
    </a>
  );
}
