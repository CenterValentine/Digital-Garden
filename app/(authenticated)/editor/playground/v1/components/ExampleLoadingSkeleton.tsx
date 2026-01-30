export function ExampleLoadingSkeleton() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gold-primary border-r-transparent mb-4"></div>
        <p className="text-gray-400">Loading example...</p>
      </div>
    </div>
  );
}
