/**
 * Diagrams.net Editor - Iframe Wrapper with postMessage Protocol
 *
 * Security Measures:
 * - Iframe sandbox: allow-scripts, allow-same-origin, allow-downloads
 * - Origin validation: Only accept messages from embed.diagrams.net
 * - CSP headers: frame-src restricted to diagrams.net
 * - XML validation: Server-side validation before save
 *
 * postMessage Protocol:
 * - init: Iframe ready, send diagram XML
 * - save: User saved diagram, extract XML
 * - export: Export complete, handle file
 */

"use client";

import { useEffect, useRef, useMemo } from "react";
import type { DiagramsNetTheme } from "@/lib/domain/visualization/types";

interface DiagramsNetEditorProps {
  xml: string;
  theme: DiagramsNetTheme;
  onChange: (xml: string) => void;
}

// Map theme names to diagrams.net UI themes
const THEME_MAP: Record<DiagramsNetTheme, string> = {
  kennedy: "kennedy",
  atlas: "atlas",
  dark: "dark",
  minimal: "min",
};

export function DiagramsNetEditor({ xml, theme, onChange }: DiagramsNetEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build embed URL with security parameters
  const embedUrl = useMemo(() => {
    const params = new URLSearchParams({
      embed: "1", // Enable embed mode
      ui: THEME_MAP[theme] || "kennedy",
      spin: "1", // Show loading spinner
      proto: "json", // Use JSON protocol for postMessage
      libraries: "1", // Enable shape libraries
      // Security: Disable plugins
      plugins: "0", // Disable plugins
      // Auto-save: Enable automatic saving
      autosave: "1",
    });
    return `https://embed.diagrams.net/?${params.toString()}`;
  }, [theme]);

  // postMessage handler with origin validation
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // SECURITY: Validate origin
      if (event.origin !== "https://embed.diagrams.net") {
        console.warn("[DiagramsNetEditor] Rejected message from unauthorized origin:", event.origin);
        return;
      }

      try {
        const message = JSON.parse(event.data);

        switch (message.event) {
          case "init":
            // Iframe is ready, send diagram XML
            console.log("[DiagramsNetEditor] Iframe initialized");
            if (iframeRef.current?.contentWindow) {
              iframeRef.current.contentWindow.postMessage(
                JSON.stringify({
                  action: "load",
                  xml: xml || "", // Send empty string if no XML
                  autosave: 1,
                }),
                "https://embed.diagrams.net"
              );
            }
            break;

          case "save":
            // User saved diagram, extract XML
            console.log("[DiagramsNetEditor] Save event received");
            if (message.xml) {
              onChange(message.xml);
            }
            break;

          case "autosave":
            // Auto-save event (same as save)
            console.log("[DiagramsNetEditor] Auto-save event received");
            if (message.xml) {
              onChange(message.xml);
            }
            break;

          case "export":
            // Export complete (handled by export handler)
            console.log("[DiagramsNetEditor] Export event received");
            break;

          case "exit":
            // User closed editor
            console.log("[DiagramsNetEditor] Exit event received");
            break;

          default:
            console.log("[DiagramsNetEditor] Unknown event:", message.event);
        }
      } catch (error) {
        console.error("[DiagramsNetEditor] Failed to parse message:", error);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [xml, onChange]);

  return (
    <iframe
      ref={iframeRef}
      src={embedUrl}
      className="w-full h-full border-none"
      // SECURITY: Sandbox attributes
      sandbox="allow-scripts allow-same-origin allow-downloads"
      // Allow fullscreen for iframe
      allow="fullscreen"
      // ARIA for accessibility
      title="Diagrams.net Editor"
      aria-label="Diagram editor powered by diagrams.net"
    />
  );
}
