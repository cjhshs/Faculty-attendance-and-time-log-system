"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FacultySearchResult } from "@/lib/custom-sheet-faculty";

export function CustomFacultySearch({
  sheetKey,
  date,
  schoolYear,
  semester,
  currentFacultyIds = [],
  availableCourses = [],
}: {
  sheetKey: string;
  date: string; // YYYY-MM-DD
  schoolYear: string;
  semester: string;
  currentFacultyIds: number[];
  availableCourses: { id: number; code: string; name: string | null }[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FacultySearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFaculty, setSelectedFaculty] = useState<FacultySearchResult | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(
    availableCourses[0]?.id ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = "custom-faculty-listbox";
  const [activeIndex, setActiveIndex] = useState(-1);

  const isDisabled = (item: FacultySearchResult) =>
    item.isAlreadyOnSheet || currentFacultyIds.includes(item.id);

  // Move the active option to the next/previous selectable row, wrapping around.
  function moveActive(delta: 1 | -1) {
    if (results.length === 0) return;
    const selectable = results
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !isDisabled(item))
      .map(({ index }) => index);
    if (selectable.length === 0) return;
    const current = selectable.indexOf(activeIndex);
    const next =
      current === -1
        ? delta === 1
          ? selectable[0]
          : selectable[selectable.length - 1]
        : selectable[(current + delta + selectable.length) % selectable.length];
    setActiveIndex(next);
    document.getElementById(`${listboxId}-option-${next}`)?.scrollIntoView({ block: "nearest" });
  }

  function choose(index: number) {
    const item = results[index];
    if (!item || isDisabled(item)) return;
    setSelectedFaculty(item);
    setIsOpen(false);
    setActiveIndex(-1);
    setFeedback(null);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch search results on query change or focus
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query,
          date,
          schoolYear,
          semester,
          currentIds: currentFacultyIds.join(","),
        });
        const res = await fetch(`/api/attendance/custom-faculty/search?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to search faculty");
        const data = await res.json();
        if (active) {
          setResults(data.results ?? []);
        }
      } catch (err) {
        if (active) {
          console.error("Custom faculty search error:", err);
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, date, schoolYear, semester, currentFacultyIds]);

  // Reset the active option whenever the list or dropdown changes.
  useEffect(() => {
    setActiveIndex(-1);
  }, [results, isOpen]);

  async function handleAdd() {
    if (!selectedFaculty) return;
    if (selectedFaculty.isAlreadyOnSheet || currentFacultyIds.includes(selectedFaculty.id)) {
      setFeedback({
        type: "error",
        message: `${selectedFaculty.fullName} is already included in this attendance sheet.`,
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/attendance/custom-faculty/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetKey,
          date,
          facultyId: selectedFaculty.id,
          courseId: selectedCourseId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not add faculty to sheet.");
      }

      setFeedback({
        type: "success",
        message: `Added ${selectedFaculty.fullName} to attendance sheet.`,
      });
      setSelectedFaculty(null);
      setQuery("");
      setIsOpen(false);

      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to add faculty.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <label className="label mb-1 block" htmlFor="custom-faculty-input">
        Custom faculty
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <input
            id="custom-faculty-input"
            type="text"
            className="input w-52 sm:w-60 text-xs py-1.5 pl-2.5 pr-7"
            placeholder="search name of faculty"
            value={selectedFaculty ? selectedFaculty.fullName : query}
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              isOpen && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
            }
            aria-label="Search faculty to add to this sheet"
            onChange={(e) => {
              setSelectedFaculty(null);
              setQuery(e.target.value);
              setIsOpen(true);
              setFeedback(null);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (!isOpen) setIsOpen(true);
                else moveActive(1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                moveActive(-1);
              } else if (e.key === "Enter") {
                if (isOpen && activeIndex >= 0) {
                  e.preventDefault();
                  choose(activeIndex);
                }
              } else if (e.key === "Escape") {
                if (isOpen) {
                  e.preventDefault();
                  setIsOpen(false);
                }
              }
            }}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {selectedFaculty ? (
            <button
              type="button"
              onClick={() => {
                setSelectedFaculty(null);
                setQuery("");
                setIsOpen(true);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-xs font-bold"
              title="Clear selection"
            >
              &times;
            </button>
          ) : loading ? (
            <progress
              className="loading-spinner absolute right-2 top-1/2 -translate-y-1/2 text-muted"
              aria-label="Searching faculty"
            />
          ) : null}

          {/* Autocomplete Dropdown */}
          {isOpen && (
            <div
              id={listboxId}
              role="listbox"
              aria-label="Faculty search results"
              className="absolute left-0 z-50 mt-1 max-h-60 w-80 overflow-y-auto rounded-md border border-line bg-white p-1 shadow-lg text-xs"
            >
              {results.length === 0 ? (
                <div className="px-3 py-2 text-muted text-center">
                  {loading ? "Searching faculty records..." : "No matching faculty found"}
                </div>
              ) : (
                results.map((item, index) => {
                  const current = isDisabled(item);
                  return (
                    <button
                      key={item.id}
                      id={`${listboxId}-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={activeIndex === index}
                      aria-disabled={current}
                      disabled={current}
                      onClick={() => choose(index)}
                      onMouseEnter={() => {
                        if (!current) setActiveIndex(index);
                      }}
                      className={`w-full text-left rounded px-2.5 py-1.5 transition-colors flex items-center justify-between gap-2 ${
                        current
                          ? "bg-slate-50 text-muted opacity-70 cursor-not-allowed"
                          : activeIndex === index
                            ? "bg-slate-100 text-ink cursor-pointer"
                            : "text-ink cursor-pointer"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {item.fullName}
                          {item.departmentCode ? (
                            <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.2 text-[10px] text-slate-700">
                              {item.departmentCode}
                            </span>
                          ) : (
                            <span className="ml-1.5 rounded bg-amber-50 px-1 py-0.2 text-[10px] text-amber-700">
                              No dept
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted">
                          {item.roomSummary ? `Room(s): ${item.roomSummary}` : "No scheduled room"}
                        </div>
                      </div>
                      <div>
                        {current ? (
                          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 shrink-0">
                            On sheet
                          </span>
                        ) : item.isCustomSaved ? (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 shrink-0">
                            Saved
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Optional Course Selection if multiple program sheets */}
        {availableCourses.length > 1 && selectedFaculty ? (
          <select
            className="input text-xs py-1.5 w-24"
            value={selectedCourseId ?? ""}
            onChange={(e) => setSelectedCourseId(e.target.value ? Number(e.target.value) : null)}
            title="Attach to program sheet"
          >
            {availableCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
        ) : null}

        <button
          type="button"
          disabled={!selectedFaculty || submitting || selectedFaculty.isAlreadyOnSheet}
          onClick={handleAdd}
          className="btn btn-primary text-xs py-1.5 px-3 shrink-0"
        >
          {submitting ? "Adding..." : "+ Add"}
        </button>
      </div>

      {feedback ? (
        <div
          role={feedback.type === "success" ? "status" : "alert"}
          className={`absolute left-0 top-full mt-1.5 z-40 rounded px-2.5 py-1 text-xs shadow-sm ${
            feedback.type === "success"
              ? "bg-emerald-50 border border-emerald-300 text-emerald-800"
              : "bg-red-50 border border-red-300 text-red-700"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}
    </div>
  );
}
