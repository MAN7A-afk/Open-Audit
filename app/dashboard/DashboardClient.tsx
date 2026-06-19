"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  BookOpen,
  ArrowRight,
  Radio,
  PauseCircle,
  PlayCircle,
  Upload,
  FileJson,
  Trash2,
} from "lucide-react";
import { SearchBar } from "@/components/dashboard/SearchBar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  FileJson,
  PauseCircle,
  PlayCircle,
  Radio,
  Trash2,
  Upload,
} from "lucide-react";
import { EventFeedTable } from "@/components/dashboard/EventFeedTable";
import { SearchBar } from "@/components/dashboard/SearchBar";
import { StatsBar } from "@/components/dashboard/StatsBar";
import { UploadAbiDialog } from "@/components/dashboard/UploadAbiDialog";
import { ExportDataDialog } from "@/components/dashboard/ExportDataDialog";
import { Button } from "@/components/ui/button";
import { useLiveFeed } from "@/lib/hooks/useLiveFeed";
import { getMockEventsForContract, MOCK_RAW_EVENTS } from "@/lib/mock-data";
import {
  buildCustomBlueprints,
  loadCustomAbis,
  removeCustomAbi,
  saveCustomAbi,
} from "@/lib/translator/custom-abi";
import { MOCK_RAW_EVENTS } from "@/lib/mock-data";
import { useLiveFeed } from "@/lib/hooks/useLiveFeed";
import type { TranslatedEvent, RawEvent, CustomAbi } from "@/lib/translator/types";
import { translateEvents } from "@/lib/translator/registry";
import type { CustomAbi, RawEvent, TranslatedEvent } from "@/lib/translator/types";

const DEFAULT_PAGE_SIZE = 25;

/** Simulates a network delay for realistic UX. */
function simulateNetworkDelay(ms: number): Promise<void> {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

export function DashboardClient(): React.JSX.Element {
  const [rawEvents, setRawEvents] = useState<RawEvent[]>(MOCK_RAW_EVENTS);
  const [customAbis, setCustomAbis] = useState<CustomAbi[]>([]);
  const [contractFilter, setContractFilter] = useState<string | null>(null);
  const [eventTopicFilter, setEventTopicFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchedContract, setSearchedContract] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(function () {
    setCustomAbis(loadCustomAbis());
  }, []);

  const customBlueprints = useMemo(
    function () {
      return buildCustomBlueprints(customAbis);
    },
    [customAbis],
  );

  const events = useMemo(
    function () {
      const translated = translateEvents(rawEvents, customBlueprints);
      return [...liveEvents, ...translated];
    },
    [rawEvents, customBlueprints, liveEvents]
  );

  const filteredEvents = useMemo(
    function () {
      return events.filter(function (e) {
        if (contractFilter && e.raw.contractId !== contractFilter) {
          return false;
        }
        if (eventTopicFilter.trim()) {
          const filter = eventTopicFilter.trim().toLowerCase();
          if (!e.eventType?.toLowerCase().includes(filter)) {
            return false;
          }
        }
        return true;
      });
    },
    [events, contractFilter, eventTopicFilter]
  );

  const handleNewEvent = useCallback((event: TranslatedEvent) => {
    setRawEvents((prev) => [event.raw, ...prev]);
  }, []);
  const handleNewEvent = useCallback(
    function (event: TranslatedEvent): void {
      if (searchedContract && event.raw.contractId !== searchedContract) {
        return;
      }

      setRawEvents(function (prev) {
        return [event.raw, ...prev];
      });
    },
    [searchedContract]
  );

  const { isLive, isPaused, newEventIds, toggleLive, togglePause } =
    useLiveFeed(handleNewEvent);

  const totalPages = Math.max(1, Math.ceil(events.length / pageSize));

  useEffect(
    function () {
      setCurrentPage(function (prev) {
        return Math.min(prev, totalPages);
      });
    },
    [totalPages]
  );

  const paginatedEvents = useMemo(
    function () {
      const startIndex = (currentPage - 1) * pageSize;
      return events.slice(startIndex, startIndex + pageSize);
    },
    [currentPage, events, pageSize]
  );

  const handleContractFilter = useCallback(function (contractId: string): void {
    setContractFilter(contractId || null);
  const handleSearch = useCallback(async function (contractId: string): Promise<void> {
    const trimmed = contractId.trim();
    setCurrentPage(1);

    if (!trimmed) {
      setRawEvents(MOCK_RAW_EVENTS);
      setSearchedContract(null);
      setError(null);

      try {
        // Simulate fetching from Stellar network
        await simulateNetworkDelay(800);

    try {
      await simulateNetworkDelay(800);
      setRawEvents(getMockEventsForContract(trimmed));
      setSearchedContract(trimmed);
    } catch {
      setError(
        "Failed to fetch events. Please check the Contract ID and try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleAbiUpload = useCallback(function (abi: CustomAbi): void {
    setCustomAbis(saveCustomAbi(abi));
    setIsUploadOpen(false);
  }, []);

  const handleAbiRemove = useCallback(function (contractId: string): void {
    setCustomAbis(removeCustomAbi(contractId));
  }, []);

  const handlePageChange = useCallback(function (page: number): void {
    setCurrentPage(page);
  }, []);

  const handlePageSizeChange = useCallback(function (nextPageSize: number): void {
    setPageSize(nextPageSize);
    setCurrentPage(1);
  }, []);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <section aria-label="Event filters">
        <SearchBar
          onSearch={handleContractFilter}
          topicFilter={eventTopicFilter}
          onTopicFilterChange={setEventTopicFilter}
        />
      </section>

      {/* Active filter indicator */}
      {(contractFilter || eventTopicFilter) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
          {contractFilter && (
            <>
              <span>Contract:</span>
              <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
                {contractFilter.slice(0, 10)}...{contractFilter.slice(-6)}
              </code>
            </>
          )}
          {eventTopicFilter && (
            <>
              <span>Event:</span>
              <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
                {eventTopicFilter}
              </code>
            </>
          )}
          <button
            type="button"
            onClick={function () {
              handleContractFilter("");
              setEventTopicFilter("");
      <section aria-label="Contract search">
        <SearchBar
          onSearch={handleSearch}
          isLoading={isLoading}
          value={searchValue}
          onValueChange={setSearchValue}
        />
      </section>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {searchedContract && !isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Showing events for:</span>
          <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
            {searchedContract.slice(0, 10)}...{searchedContract.slice(-6)}
          </code>
          <button
            type="button"
            onClick={function () {
              setSearchValue("");
              handleSearch("");
            }}
            className="text-xs text-violet-600 hover:underline dark:text-violet-400"
          >
            Clear all filters
          </button>
        </div>
      )}

      <section aria-label="Custom ABIs" className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={function () {
            setIsUploadOpen(true);
          }}
        >
          <Upload className="mr-2 h-4 w-4" />
          Upload Custom ABI
        </Button>

        {customAbis.map(function (abi) {
          return (
            <span
              key={abi.contractId}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-2.5 pr-1.5 text-xs"
              title={abi.contractId}
            >
              <FileJson className="h-3.5 w-3.5 text-violet-500" />
              <span className="font-medium">{abi.contractName}</span>
              <button
                type="button"
                onClick={function () {
                  handleAbiRemove(abi.contractId);
                }}
                className="text-muted-foreground transition-colors hover:text-destructive"
                aria-label={`Remove custom ABI for ${abi.contractName}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          );
        })}
      </section>

      {/* Stats */}
      <StatsBar events={events} />
      {!isLoading && <StatsBar events={events} />}

      <section aria-label="Event feed">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Event Feed
          </h2>
          <div className="flex items-center gap-2">
            {/* Export Data button — placed at the header boundary of the event stream */}
            <Button
              id="export-data-button"
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950"
              onClick={function () {
                setIsExportOpen(true);
              }}
              disabled={isLoading || events.length === 0}
              aria-label="Export filtered event data"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export Data
            </Button>
            {isLive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={togglePause}
                aria-label={isPaused ? "Resume feed" : "Pause feed"}
              >
                {isPaused ? (
                  <>
                    <PlayCircle className="mr-1 h-3.5 w-3.5 text-green-500" />
                    Resume
                  </>
                ) : (
                  <>
                    <PauseCircle className="mr-1 h-3.5 w-3.5 text-amber-500" />
                    Pause
                  </>
                )}
              </Button>
            )}
            <Button
              variant={isLive ? "destructive" : "outline"}
              size="sm"
              className={`h-7 px-3 text-xs ${
                !isLive
                  ? "border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950"
                  : ""
              }`}
              onClick={toggleLive}
            >
              <Radio className={`mr-1.5 h-3.5 w-3.5 ${isLive ? "animate-pulse" : ""}`} />
              {isLive ? "Stop Live" : "Live Feed"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {`${filteredEvents.length} event${filteredEvents.length !== 1 ? "s" : ""}`}
            </span>
          </div>
        </div>
        <EventFeedTable events={filteredEvents} newEventIds={newEventIds} />
              {isBusy ? "Loading..." : `${events.length} events`}
            </span>
          </div>
        </div>

        <EventFeedTable
          events={paginatedEvents}
          isLoading={isLoading}
          newEventIds={newEventIds}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={events.length}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </section>

      <section
        aria-label="Contribute"
        className="rounded-lg border border-violet-200 bg-violet-50 p-5 dark:border-violet-800 dark:bg-violet-950/30"
      >
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <BookOpen className="mt-0.5 h-5 w-5 flex-shrink-0 text-violet-600 dark:text-violet-400" />
            <div>
              <p className="text-sm font-medium">Help translate more contracts</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Open-Audit is community-powered. Add a translation blueprint and earn Stellar Drips
                rewards.
              </p>
            </div>
          </div>
          <a
            href="https://github.com/your-org/open-audit/blob/main/CONTRIBUTING.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-violet-700 hover:underline dark:text-violet-400"
          >
            Read the guide
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <UploadAbiDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onUpload={handleAbiUpload}
      />

      {/* Export Data dialog */}
      <ExportDataDialog
        open={isExportOpen}
        onOpenChange={setIsExportOpen}
        events={events}
      />
    </div>
  );
}
