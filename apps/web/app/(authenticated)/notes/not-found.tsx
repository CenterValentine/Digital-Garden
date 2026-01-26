import Link from 'next/link'

export default function NotesNotFound() {
  return (
    <div className="flex h-full items-center justify-center bg-transparent px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-2xl font-semibold text-foreground">
          Note Not Found
        </h2>
        <p className="mt-2 text-muted-foreground">
          The note you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            href="/notes"
            className="inline-flex items-center rounded-md bg-gold-primary px-4 py-2 text-sm font-semibold text-shale-dark shadow-sm hover:bg-gold-light transition-colors"
          >
            Go to notes home
          </Link>
        </div>
      </div>
    </div>
  )
}
