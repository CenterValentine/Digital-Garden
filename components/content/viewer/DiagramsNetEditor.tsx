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
 *
 * Imperative API (via ref):
 * - loadXml(xml): push a new diagram into the already-loaded iframe.
 *   Buffers the call if the iframe hasn't sent "init" yet (e.g. after a
 *   theme change reloads the src) and flushes automatically on next init.
 */

"use client";

import { useEffect, useRef, useMemo, useImperativeHandle, forwardRef } from "react";
import type { DiagramsNetTheme } from "@/lib/domain/visualization/types";

interface DiagramsNetEditorProps {
  xml: string;
  theme: DiagramsNetTheme;
  onChange: (xml: string) => void;
}

export interface DiagramsNetEditorHandle {
  /** Push a new XML diagram into the live iframe without waiting for init. */
  loadXml: (xml: string) => void;
}

// Map theme names to diagrams.net UI themes
const THEME_MAP: Record<DiagramsNetTheme, string> = {
  kennedy: "kennedy",
  atlas: "atlas",
  dark: "dark",
  minimal: "min",
};

export const DiagramsNetEditor = forwardRef<DiagramsNetEditorHandle, DiagramsNetEditorProps>(
  ({ xml, theme, onChange }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    // Ref-tracked xml so the init handler always uses the latest value
    // without needing xml in the effect dependency array (which would re-register
    // the listener on every keystroke and never push updates to the live iframe).
    const xmlRef = useRef(xml);
    const isReadyRef = useRef(false);
    const pendingXmlRef = useRef<string | null>(null);

    // Keep ref in sync with prop (no effect needed — synchronous before render)
    xmlRef.current = xml;

    // Reset ready state when the embed URL changes (theme change reloads iframe src).
    const embedUrl = useMemo(() => {
      const params = new URLSearchParams({
        embed: "1",
        ui: THEME_MAP[theme] || "kennedy",
        proto: "json",
        libraries: "1",
        plugins: "0",
        autosave: "1",
        // Suppress the combined "Save & Exit" button. With saveAndExit=1 (embed
        // default), noSaveBtn/noExitBtn only hide the *individual* buttons —
        // the combined one still renders unless saveAndExit is explicitly 0.
        saveAndExit: "0",
        noSaveBtn: "1",
        noExitBtn: "1",
      });
      return `https://embed.diagrams.net/?${params.toString()}`;
    }, [theme]);

    useEffect(() => {
      isReadyRef.current = false;
    }, [embedUrl]);

    // Expose loadXml so DiagramsNetViewer can push remote Y.js updates into
    // the live iframe without going through React state (which can't trigger
    // a re-send because init only fires once per iframe load).
    useImperativeHandle(ref, () => ({
      loadXml: (newXml: string) => {
        if (!isReadyRef.current) {
          pendingXmlRef.current = newXml;
          return;
        }
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ action: "load", xml: newXml, autosave: 1 }),
          "https://embed.diagrams.net"
        );
      },
    }));

    // postMessage handler — only [onChange] in deps so this doesn't re-register
    // on every xml prop change (which would never push updates anyway since
    // init is a one-time event per iframe lifecycle).
    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        // SECURITY: Validate origin
        if (event.origin !== "https://embed.diagrams.net") {
          return;
        }

        try {
          const message = JSON.parse(event.data);

          switch (message.event) {
            case "init":
              isReadyRef.current = true;
              // Flush pending remote update, or fall back to current xml prop
              const xmlToLoad = pendingXmlRef.current ?? xmlRef.current ?? "";
              pendingXmlRef.current = null;
              if (iframeRef.current?.contentWindow) {
                iframeRef.current.contentWindow.postMessage(
                  JSON.stringify({ action: "load", xml: xmlToLoad, autosave: 1 }),
                  "https://embed.diagrams.net"
                );
              }
              break;

            case "save":
            case "autosave":
              if (message.xml) {
                onChange(message.xml);
              }
              break;

            case "export":
            case "exit":
              break;

            default:
              break;
          }
        } catch (error) {
          console.error("[DiagramsNetEditor] Failed to parse message:", error);
        }
      };

      window.addEventListener("message", handleMessage);
      return () => {
        window.removeEventListener("message", handleMessage);
        // Do NOT reset isReadyRef here. Iframe readiness is tied to the iframe's
        // lifetime, not to the listener's. The init event fires exactly once per
        // iframe load, so if a re-registration (from an onChange identity change)
        // resets isReadyRef, it can never go back to true — and remote Y.js
        // updates would silently buffer into pendingXmlRef forever.
        // isReadyRef is reset only on embedUrl change (separate effect above).
      };
    }, [onChange]);

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
);

DiagramsNetEditor.displayName = "DiagramsNetEditor";
