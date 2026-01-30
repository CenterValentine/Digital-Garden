import { getSurfaceStyles } from "@/lib/design/system";

export default function PlaygroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const glass0 = getSurfaceStyles("glass-0");

  return (
    <div className="fixed top-[56px] left-0 right-0 bottom-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="h-12 border-b border-white/10 px-4 flex items-center"
        style={{
          background: glass0.background,
          backdropFilter: glass0.backdropFilter,
        }}
      >
        <h1 className="text-lg font-semibold text-gold-primary">
          TipTap Playground v1
        </h1>
        <span className="ml-4 text-sm text-gray-400">
          Isolated vanilla TipTap examples
        </span>
      </div>

      {/* Main content */}
      {children}
    </div>
  );
}
