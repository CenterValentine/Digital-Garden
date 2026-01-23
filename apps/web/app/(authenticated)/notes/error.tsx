'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function NotesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Notes application error:', error)
  }, [error])

  return (
    <div className="flex h-full items-center justify-center bg-transparent px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-foreground">500</h1>
        <h2 className="mt-4 text-2xl font-semibold text-foreground">
          Something went wrong!
        </h2>
        <p className="mt-2 text-muted-foreground">
          We're sorry, but something unexpected happened. Please try again.
        </p>
        {error.digest && (
          <p className="mt-2 text-sm text-muted-foreground">
            Error ID: {error.digest}
          </p>
        )}
        <div className="mt-6 flex gap-4 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center rounded-md bg-gold-primary px-4 py-2 text-sm font-semibold text-shale-dark shadow-sm hover:bg-gold-light transition-colors"
          >
            Try again
          </button>
          <Link
            href="/notes"
            className="inline-flex items-center rounded-md border border-white/20 bg-glass-0 px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-white/5 transition-colors"
          >
            Go to notes home
          </Link>
        </div>
      </div>
    </div>
  )
}
