"use client";

import { useState } from "react";
import type { PDFExportOptions } from "@/lib/resume/types";
import type { FilterState } from "@/lib/resume/filtering";
import { Button } from "@/components/client/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/client/ui/dropdown-menu";
import { Download, Loader2 } from "lucide-react";

interface PDFExportButtonProps {
  filterState: FilterState;
  variantId?: string;
  onExport: (options: PDFExportOptions) => Promise<void>;
}

export function PDFExportButton({
  filterState,
  variantId,
  onExport,
}: PDFExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<
    "full" | "one-page" | "custom"
  >("full");

  const handleExport = async (format: "full" | "one-page" | "custom") => {
    setIsExporting(true);
    setExportFormat(format);

    try {
      const options: PDFExportOptions = {
        format,
        variant: variantId,
        sections: Object.entries(filterState.sections)
          .filter(([_, visible]) => visible)
          .map(([section]) => section),
        priorityThreshold: filterState.priorityThreshold,
        useScoring: format === "one-page",
        includePhone: true,
      };

      await onExport(options);
    } catch (error) {
      console.error("Export failed:", error);
      // TODO: Show error toast
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={isExporting} className="w-full sm:w-auto">
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Export PDF
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handleExport("full")}
          disabled={isExporting}
        >
          Full Resume
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport("one-page")}
          disabled={isExporting}
        >
          One-Page Resume
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport("custom")}
          disabled={isExporting}
        >
          Custom...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
