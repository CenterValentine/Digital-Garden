/**
 * Mobile shell layout.
 *
 * The root layout (app/layout.tsx) wraps every route with the global NavBar
 * (inside `.notes-route-hides-default-nav`) and a `pt-20` <main>
 * (`.notes-route-no-padding`). Inside the native WebView that desktop nav is
 * just noise that overlaps the shell, so we hide it the same way the /content
 * layout does: inject a scoped <style> that flips those already-present
 * utility classes. No globals.css change, no body marker — the style applies
 * only while a /mobile route is mounted.
 */

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .notes-route-hides-default-nav { display: none !important; }
            .notes-route-no-padding { padding-top: 0 !important; }
          `,
        }}
      />
      {children}
    </>
  );
}
