"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSurfaceStyles } from "@/lib/design/system";
import { EXAMPLES } from "../types";

export function PlaygroundSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeExample = searchParams.get("example") || "default-text-editor";
  const glass0 = getSurfaceStyles("glass-0");
  const [mounted, setMounted] = useState(false);

  // Mount effect
  useEffect(() => {
    setMounted(true);
  }, []);

  // Persist last viewed example to localStorage
  useEffect(() => {
    if (mounted && activeExample) {
      localStorage.setItem("playground-last-example", activeExample);
    }
  }, [activeExample, mounted]);

  const handleExampleClick = (slug: string) => {
    router.push(`/editor/playground/v1?example=${slug}`);
  };

  return (
    <div
      className="w-60 border-r border-white/10 overflow-y-auto"
      style={{
        background: glass0.background,
        backdropFilter: glass0.backdropFilter,
      }}
    >
      <div className="p-4">
        <h2 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">
          Examples
        </h2>

        <ul className="space-y-1">
          {EXAMPLES.map((example) => {
            const isActive = activeExample === example.slug;
            return (
              <li key={example.slug}>
                <button
                  onClick={() => handleExampleClick(example.slug)}
                  className={`
                    w-full text-left px-3 py-2 rounded transition-colors text-sm
                    ${
                      isActive
                        ? "bg-gold-primary/20 text-gold-primary border-l-2 border-gold-primary"
                        : "text-gray-300 hover:bg-white/5 hover:text-white"
                    }
                  `}
                >
                  <div className="font-medium">{example.name}</div>
                  <div
                    className={`text-xs mt-0.5 ${
                      isActive ? "text-gold-primary/70" : "text-gray-500"
                    }`}
                  >
                    {example.description}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
