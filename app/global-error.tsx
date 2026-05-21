'use client'

// global-error.tsx REPLACES the root layout when a root-layout-level error
// is thrown — that means the pre-hydration THEME_SCRIPT didn't get a chance
// to apply `.dark` to <html>. So we can't theme via the `.dark` class here.
//
// Strategy: a <style> block using `@media (prefers-color-scheme: dark)` so
// the browser honors the visitor's OS theme. This won't honor a manual
// in-app theme override (user explicitly chose light but OS is dark =
// dark page), but at the moment of catastrophic root-level failure, the
// in-app override is the thing that just crashed. OS is the only signal
// we can trust here.

const STYLES = `
  body { margin: 0; }
  .ge-root {
    padding: 2rem;
    font-family: system-ui, sans-serif;
    background: #ffffff;
    color: #171717;
    min-height: 100vh;
    box-sizing: border-box;
  }
  .ge-message { color: #666666; }
  .ge-digest { color: #999999; font-size: 0.875rem; }
  .ge-stack {
    background: #f5f5f5;
    color: #171717;
    padding: 1rem;
    border-radius: 4px;
    overflow: auto;
    max-height: 300px;
    font-size: 0.8rem;
  }
  .ge-reset {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: #0070f3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  @media (prefers-color-scheme: dark) {
    .ge-root { background: #0a0a0a; color: #f5f5f5; }
    .ge-message { color: #a0a0a0; }
    .ge-digest { color: #707070; }
    .ge-stack { background: #1a1a1a; color: #f5f5f5; }
  }
`

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
        <div className="ge-root">
          <h1>Something went wrong</h1>
          <p className="ge-message">{error.message}</p>
          {error.digest && (
            <p className="ge-digest">
              Error ID: {error.digest}
            </p>
          )}
          <pre className="ge-stack">
            {error.stack}
          </pre>
          <button onClick={reset} className="ge-reset">
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
