/**
 * Enhanced Tree Debug View
 *
 * Displays ProseMirror-like hierarchical document tree structure with CSS/style information.
 * Shows node types, attributes, marks, computed styles, box model, and table formatting.
 */

"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import type { JSONContent } from "@tiptap/core";

interface TreeDebugViewProps {
  content: JSONContent;
  title: string;
}

interface TreeNodeProps {
  node: JSONContent | string;
  depth: number;
  isLast: boolean;
  parentPrefix: string;
  showStyles: boolean;
  showBoxModel: boolean;
}

interface NodeStyleInfo {
  classes: string[];
  computedStyles: Record<string, string>;
  boxModel: {
    padding?: string;
    margin?: string;
    border?: string;
  };
  indentationPx?: number;
}

/**
 * Get CSS/style information for a node type
 */
function getNodeStyleInfo(nodeType: string, attrs: any, depth: number): NodeStyleInfo {
  const info: NodeStyleInfo = {
    classes: [],
    computedStyles: {},
    boxModel: {},
  };

  switch (nodeType) {
    case "doc":
      info.classes = [".ProseMirror"];
      info.computedStyles = {
        "line-height": "1.6",
        "font-family": "system-ui, sans-serif",
      };
      break;

    case "paragraph":
      info.classes = [".ProseMirror-paragraph"];
      info.boxModel = { margin: "16px 0" };
      info.computedStyles = {
        "line-height": "1.6",
        "min-height": "1em",
      };
      break;

    case "heading":
      const level = attrs?.level || 1;
      info.classes = [".ProseMirror-heading", `.h${level}`];
      const headingSizes: Record<number, string> = {
        1: "32px",
        2: "24px",
        3: "20px",
        4: "18px",
        5: "16px",
        6: "14px",
      };
      info.computedStyles = {
        "font-size": headingSizes[level],
        "font-weight": "600",
        "line-height": "1.3",
      };
      info.boxModel = {
        margin: level === 1 ? "32px 0 16px" : "24px 0 8px",
      };
      break;

    case "bulletList":
      info.classes = [".ProseMirror-bulletList"];
      info.boxModel = {
        padding: "0 0 0 24px",
        margin: "8px 0",
      };
      info.indentationPx = depth * 24;
      break;

    case "orderedList":
      info.classes = [".ProseMirror-orderedList"];
      info.boxModel = {
        padding: "0 0 0 24px",
        margin: "8px 0",
      };
      info.indentationPx = depth * 24;
      break;

    case "listItem":
      info.classes = [".ProseMirror-listItem"];
      info.computedStyles = {
        display: "list-item",
        "list-style-position": "outside",
      };
      info.indentationPx = depth * 24;
      break;

    case "codeBlock":
      info.classes = [".ProseMirror-codeBlock", ".hljs"];
      info.computedStyles = {
        "font-family": '"JetBrains Mono", "Fira Code", monospace',
        "font-size": "14px",
        "line-height": "1.5",
        "background": "rgba(0, 0, 0, 0.3)",
        color: "#e5e7eb",
      };
      info.boxModel = {
        padding: "16px",
        margin: "16px 0",
        border: "1px solid rgba(255, 255, 255, 0.1)",
      };
      break;

    case "blockquote":
      info.classes = [".ProseMirror-blockquote"];
      info.computedStyles = {
        color: "#9ca3af",
        "font-style": "italic",
      };
      info.boxModel = {
        padding: "0 0 0 16px",
        margin: "16px 0",
        border: "3px solid rgba(59, 130, 246, 0.3)",
      };
      break;

    case "table":
      info.classes = [".ProseMirror-table"];
      info.computedStyles = {
        "border-collapse": "collapse",
        width: "100%",
      };
      info.boxModel = {
        margin: "16px 0",
        border: "1px solid rgba(255, 255, 255, 0.2)",
      };
      break;

    case "tableRow":
      info.classes = [".ProseMirror-tableRow"];
      info.computedStyles = {
        "border-bottom": "1px solid rgba(255, 255, 255, 0.1)",
      };
      break;

    case "tableHeader":
      info.classes = [".ProseMirror-tableHeader", "th"];
      info.computedStyles = {
        "font-weight": "600",
        "text-align": "left",
        background: "rgba(59, 130, 246, 0.1)",
      };
      info.boxModel = {
        padding: "8px 12px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
      };
      break;

    case "tableCell":
      info.classes = [".ProseMirror-tableCell", "td"];
      info.computedStyles = {
        "vertical-align": "top",
      };
      info.boxModel = {
        padding: "8px 12px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
      };
      break;

    case "wikiLink":
      info.classes = [".wiki-link"];
      info.computedStyles = {
        color: "rgb(59, 130, 246)",
        "text-decoration": "underline",
        cursor: "pointer",
      };
      break;

    case "callout":
      const calloutType = attrs?.type || "note";
      info.classes = [".callout", `.callout-${calloutType}`];
      const calloutColors: Record<string, string> = {
        note: "rgb(59, 130, 246)",
        tip: "rgb(34, 197, 94)",
        warning: "rgb(251, 191, 36)",
        danger: "rgb(239, 68, 68)",
        info: "rgb(96, 165, 250)",
        success: "rgb(16, 185, 129)",
      };
      info.computedStyles = {
        background: `${calloutColors[calloutType]}15`,
        color: calloutColors[calloutType],
      };
      info.boxModel = {
        padding: "12px 16px",
        margin: "16px 0",
        border: `3px solid ${calloutColors[calloutType]}`,
      };
      break;

    case "taskList":
      info.classes = [".ProseMirror-taskList"];
      info.boxModel = {
        padding: "0",
        margin: "8px 0",
      };
      break;

    case "taskItem":
      info.classes = [".ProseMirror-taskItem"];
      info.computedStyles = {
        display: "flex",
        "align-items": "flex-start",
        gap: "8px",
      };
      break;

    default:
      info.classes = [`.ProseMirror-${nodeType}`];
  }

  return info;
}

function TreeNode({ node, depth, isLast, parentPrefix, showStyles, showBoxModel }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2); // Auto-expand first 2 levels

  // Handle text nodes (strings)
  if (typeof node === "string") {
    const truncated = node.length > 50 ? `${node.slice(0, 50)}...` : node;
    const escaped = truncated.replace(/\n/g, "\\n").replace(/\t/g, "\\t");

    return (
      <div className="flex items-start text-xs font-mono">
        <span className="text-gray-600 select-none">{parentPrefix}</span>
        <span className="text-gray-600 select-none">{isLast ? "└─ " : "├─ "}</span>
        <span className="text-blue-400">Text:</span>
        <span className="text-gray-300 ml-2">"{escaped}"</span>
      </div>
    );
  }

  // Handle object nodes
  const nodeType = (node as any).type || "unknown";
  const hasChildren = (node as any).content && Array.isArray((node as any).content) && (node as any).content.length > 0;
  const attrs = (node as any).attrs || {};
  const marks = (node as any).marks || [];

  // Get style information
  const styleInfo = getNodeStyleInfo(nodeType, attrs, depth);

  // Build current line prefix
  const currentPrefix = parentPrefix + (isLast ? "   " : "│  ");

  // Format attributes for display
  const attrEntries = Object.entries(attrs).filter(([_, value]) => value !== null && value !== undefined);
  const attrString = attrEntries.length > 0
    ? ` (${attrEntries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(", ")})`
    : "";

  // Format marks for display
  const marksString = marks.length > 0
    ? ` [${marks.map((m: any) => m.type).join(", ")}]`
    : "";

  // Special handling for table cells - check if empty
  const isTableCell = nodeType === "tableCell" || nodeType === "tableHeader";
  const isEmpty = isTableCell && (!hasChildren || (hasChildren && (node as any).content.length === 1 && (node as any).content[0].type === "paragraph" && !(node as any).content[0].content));

  return (
    <div>
      <div className="flex flex-col text-xs font-mono group hover:bg-white/5 rounded px-1 -mx-1">
        {/* Main node line */}
        <div className="flex items-start cursor-pointer" onClick={() => hasChildren && setIsExpanded(!isExpanded)}>
          <span className="text-gray-600 select-none">{parentPrefix}</span>
          <span className="text-gray-600 select-none">{isLast ? "└─ " : "├─ "}</span>
          {hasChildren && (
            <span className="text-gray-500 select-none mr-1">
              {isExpanded ? <ChevronDown className="h-3 w-3 inline" /> : <ChevronRight className="h-3 w-3 inline" />}
            </span>
          )}
          {!hasChildren && <span className="w-4 inline-block" />}

          <div className="flex-1">
            <span className="text-green-400 font-semibold">{nodeType}</span>
            {attrString && <span className="text-yellow-400">{attrString}</span>}
            {marksString && <span className="text-purple-400">{marksString}</span>}
            {isEmpty && <span className="text-red-400 ml-2">[empty]</span>}

            {/* Indentation indicator */}
            {styleInfo.indentationPx !== undefined && (
              <span className="text-cyan-400 ml-2">⇥ {styleInfo.indentationPx}px</span>
            )}
          </div>
        </div>

        {/* CSS Classes */}
        {showStyles && styleInfo.classes.length > 0 && (
          <div className="flex items-start ml-8 mt-1">
            <span className="text-gray-500 mr-2">Classes:</span>
            <span className="text-orange-400">{styleInfo.classes.join(" ")}</span>
          </div>
        )}

        {/* Computed Styles */}
        {showStyles && Object.keys(styleInfo.computedStyles).length > 0 && (
          <div className="flex flex-col ml-8 mt-1">
            <span className="text-gray-500 mb-1">Styles:</span>
            {Object.entries(styleInfo.computedStyles).map(([key, value]) => (
              <div key={key} className="ml-2">
                <span className="text-pink-400">{key}:</span>
                <span className="text-gray-300 ml-1">{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Box Model */}
        {showBoxModel && (styleInfo.boxModel.padding || styleInfo.boxModel.margin || styleInfo.boxModel.border) && (
          <div className="flex flex-col ml-8 mt-1">
            <span className="text-gray-500 mb-1">Box Model:</span>
            {styleInfo.boxModel.margin && (
              <div className="ml-2">
                <span className="text-emerald-400">margin:</span>
                <span className="text-gray-300 ml-1">{styleInfo.boxModel.margin}</span>
              </div>
            )}
            {styleInfo.boxModel.padding && (
              <div className="ml-2">
                <span className="text-emerald-400">padding:</span>
                <span className="text-gray-300 ml-1">{styleInfo.boxModel.padding}</span>
              </div>
            )}
            {styleInfo.boxModel.border && (
              <div className="ml-2">
                <span className="text-emerald-400">border:</span>
                <span className="text-gray-300 ml-1">{styleInfo.boxModel.border}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className="ml-0">
          {(node as any).content.map((child: any, index: number) => (
            <TreeNode
              key={index}
              node={child}
              depth={depth + 1}
              isLast={index === (node as any).content.length - 1}
              parentPrefix={currentPrefix}
              showStyles={showStyles}
              showBoxModel={showBoxModel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeDebugView({ content, title }: TreeDebugViewProps) {
  const [showStyles, setShowStyles] = useState(false);
  const [showBoxModel, setShowBoxModel] = useState(false);

  return (
    <div className="h-full flex flex-col bg-black/40">
      {/* Header with toggles */}
      <div className="flex-none px-4 py-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Document Tree</h3>
            <p className="text-xs text-gray-400">{title}</p>
          </div>
        </div>

        {/* Toggle controls */}
        <div className="flex gap-2 mt-3">
          <Button
            onClick={() => setShowStyles(!showStyles)}
            size="sm"
            variant={showStyles ? "default" : "ghost"}
            className="text-xs gap-1.5"
          >
            {showStyles ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            CSS Styles
          </Button>
          <Button
            onClick={() => setShowBoxModel(!showBoxModel)}
            size="sm"
            variant={showBoxModel ? "default" : "ghost"}
            className="text-xs gap-1.5"
          >
            {showBoxModel ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            Box Model
          </Button>
        </div>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-auto px-4 py-4">
        <TreeNode
          node={content}
          depth={0}
          isLast={true}
          parentPrefix=""
          showStyles={showStyles}
          showBoxModel={showBoxModel}
        />
      </div>

      {/* Legend footer */}
      <div className="flex-none px-4 py-2 border-t border-white/10 text-xs text-gray-400">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-green-400">■</span> Node Type
            <span className="text-yellow-400">■</span> Attributes
          </div>
          <div className="flex items-center gap-2">
            <span className="text-purple-400">■</span> Marks
            <span className="text-blue-400">■</span> Text
          </div>
          <div className="flex items-center gap-2">
            <span className="text-orange-400">■</span> CSS Classes
            <span className="text-pink-400">■</span> Styles
          </div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">■</span> Box Model
            <span className="text-cyan-400">■</span> Indentation
          </div>
        </div>
      </div>
    </div>
  );
}
