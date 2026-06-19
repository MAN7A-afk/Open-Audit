"use client";

import { useState } from "react";
import { Download, FileText, Braces, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  eventsToCSV,
  eventsToJSON,
  triggerDownload,
  buildFilename,
} from "@/lib/export-data";
import type { TranslatedEvent } from "@/lib/translator/types";

interface ExportDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: TranslatedEvent[];
}

type ExportFormat = "csv" | "json";

export function ExportDataDialog({
  open,
  onOpenChange,
  events,
}: ExportDataDialogProps): React.JSX.Element {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("csv");
  const [isExporting, setIsExporting] = useState(false);

  function handleExport(): void {
    setIsExporting(true);

    try {
      const filename = buildFilename(selectedFormat);

      if (selectedFormat === "csv") {
        triggerDownload(eventsToCSV(events), filename, "text/csv;charset=utf-8;");
      } else {
        triggerDownload(
          eventsToJSON(events),
          filename,
          "application/json;charset=utf-8;"
        );
      }
    } finally {
      // Brief visual confirmation before closing
      setTimeout(function () {
        setIsExporting(false);
        onOpenChange(false);
      }, 600);
    }
  }

  const formatOptions: Array<{
    id: ExportFormat;
    label: string;
    description: string;
    icon: React.ReactNode;
    ext: string;
  }> = [
    {
      id: "csv",
      label: "CSV",
      description: "Comma-separated values. Opens in Excel, Google Sheets, and any spreadsheet tool.",
      icon: <FileText className="h-5 w-5" />,
      ext: ".csv",
    },
    {
      id: "json",
      label: "JSON",
      description: "Structured JSON array. Ideal for programmatic processing and API integrations.",
      icon: <Braces className="h-5 w-5" />,
      ext: ".json",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            Export Event Data
          </DialogTitle>
          <DialogDescription>
            Download the currently filtered{" "}
            <span className="font-medium text-foreground">{events.length}</span>{" "}
            events as a structured file for audit records or third-party reporting.
          </DialogDescription>
        </DialogHeader>

        {/* Exported columns info */}
        <div className="rounded-md border bg-muted/40 px-4 py-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground text-[11px] uppercase tracking-wider mb-1.5">
            Exported columns
          </p>
          {[
            "Timestamp",
            "Ledger ID",
            "Contract ID",
            "Event Name",
            "Plain English Translation",
          ].map(function (col) {
            return (
              <div key={col} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-violet-500 flex-shrink-0" />
                <span>{col}</span>
              </div>
            );
          })}
        </div>

        {/* Format selection */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Choose format
          </p>
          <div className="grid grid-cols-2 gap-3">
            {formatOptions.map(function (option) {
              const isSelected = selectedFormat === option.id;
              return (
                <button
                  key={option.id}
                  id={`export-format-${option.id}`}
                  type="button"
                  onClick={function () {
                    setSelectedFormat(option.id);
                  }}
                  className={`flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                    isSelected
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40 ring-1 ring-violet-500"
                      : "border-border hover:border-violet-300 hover:bg-muted/40 dark:hover:border-violet-700"
                  }`}
                  aria-pressed={isSelected}
                  aria-label={`Export as ${option.label}`}
                >
                  <div
                    className={`${isSelected ? "text-violet-600 dark:text-violet-400" : "text-muted-foreground"}`}
                  >
                    {option.icon}
                  </div>
                  <div>
                    <p
                      className={`text-sm font-semibold ${isSelected ? "text-violet-700 dark:text-violet-300" : ""}`}
                    >
                      {option.label}{" "}
                      <span className="font-normal text-xs text-muted-foreground">
                        {option.ext}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {option.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={function () {
              onOpenChange(false);
            }}
            id="export-dialog-cancel"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            id="export-dialog-confirm"
            onClick={handleExport}
            disabled={isExporting || events.length === 0}
            className="bg-violet-600 hover:bg-violet-700 text-white dark:bg-violet-600 dark:hover:bg-violet-700 min-w-[120px]"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            {isExporting
              ? "Downloading…"
              : `Download ${selectedFormat.toUpperCase()}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
