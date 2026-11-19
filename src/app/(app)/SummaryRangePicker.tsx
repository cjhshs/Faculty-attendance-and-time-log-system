"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { formatISODate, parseISODate } from "@/lib/dates";
import {
  SUMMARY_RANGE_MODES,
  firstCutoffRange,
  secondCutoffRange,
  type SummaryRangeMode,
} from "@/lib/summary-range";

/**
 * Range controls for the Attendance Summary form. The mode and month drive the
 * two cutoff presets; Custom Range reveals the inclusive Start/End inputs.
 * Resolved dates are always submitted so print/export links stay in sync.
 */
export function SummaryRangePicker({
  mode,
  month,
  start,
  end,
}: {
  mode: SummaryRangeMode;
  month: string;
  start: string;
  end: string;
}) {
  const [selectedMode, setSelectedMode] = useState<SummaryRangeMode>(mode);
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [startDate, setStartDate] = useState(start);
  const [endDate, setEndDate] = useState(end);
  const [error, setError] = useState("");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync with server/URL range values */
    setSelectedMode(mode);
    setSelectedMonth(month);
    setStartDate(start);
    setEndDate(end);
    setError("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [mode, month, start, end]);

  useEffect(() => {
    function onRestore(event: Event) {
      const values = (event as CustomEvent<{ values?: Record<string, unknown> }>).detail?.values;
      if (!values) return;
      // PersistForm never restores date inputs, so a saved Custom Range cannot
      // be reconstructed. Restore only the cutoff presets.
      if (values.rangeMode === "first" || values.rangeMode === "second") {
        setSelectedMode(values.rangeMode);
      }
      if (typeof values.month === "string" && /^\d{4}-\d{2}$/.test(values.month)) {
        setSelectedMonth(values.month);
      }
    }
    window.addEventListener("fa:draft-restored", onRestore);
    return () => window.removeEventListener("fa:draft-restored", onRestore);
  }, []);

  const presetRange = useMemo(() => {
    if (selectedMode === "custom") return null;
    return selectedMode === "first"
      ? firstCutoffRange(selectedMonth)
      : secondCutoffRange(selectedMonth);
  }, [selectedMode, selectedMonth]);

  const submittedStart =
    selectedMode === "custom" ? startDate : presetRange ? formatISODate(presetRange.start) : start;
  const submittedEnd =
    selectedMode === "custom" ? endDate : presetRange ? formatISODate(presetRange.end) : end;

  function validateCustomRange(event: MouseEvent<HTMLButtonElement>) {
    setError("");
    if (selectedMode !== "custom") return;
    if (!startDate || !endDate) {
      event.preventDefault();
      setError("Start Date and End Date are required for a Custom Range.");
      return;
    }
    const parsedStart = parseISODate(startDate);
    const parsedEnd = parseISODate(endDate);
    if (
      !parsedStart ||
      !parsedEnd ||
      formatISODate(parsedStart) !== startDate ||
      formatISODate(parsedEnd) !== endDate
    ) {
      event.preventDefault();
      setError("Enter valid Start Date and End Date values.");
      return;
    }
    if (parsedStart > parsedEnd) {
      event.preventDefault();
      setError("End Date cannot be earlier than Start Date.");
    }
  }

  return (
    <>
      <div>
        <label className="label" htmlFor="summary-range-mode">
          Date range
        </label>
        <select
          id="summary-range-mode"
          name="rangeMode"
          className="input"
          value={selectedMode}
          onChange={(event) => {
            setSelectedMode(event.target.value as SummaryRangeMode);
            setError("");
          }}
        >
          {SUMMARY_RANGE_MODES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {selectedMode === "custom" ? (
        <>
          <div>
            <label className="label" htmlFor="summary-custom-start">
              Start Date
            </label>
            <input
              id="summary-custom-start"
              type="date"
              name="start"
              className="input"
              value={startDate}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "summary-range-error" : undefined}
              onChange={(event) => {
                setStartDate(event.target.value);
                setError("");
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor="summary-custom-end">
              End Date
            </label>
            <input
              id="summary-custom-end"
              type="date"
              name="end"
              className="input"
              value={endDate}
              min={startDate || undefined}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "summary-range-error" : undefined}
              onChange={(event) => {
                setEndDate(event.target.value);
                setError("");
              }}
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="label" htmlFor="summary-range-month">
              Month
            </label>
            <input
              id="summary-range-month"
              type="month"
              name="month"
              className="input"
              value={selectedMonth}
              required
              onChange={(event) => {
                setSelectedMonth(event.target.value);
                setError("");
              }}
            />
          </div>
          <input type="hidden" name="start" value={submittedStart} />
          <input type="hidden" name="end" value={submittedEnd} />
        </>
      )}

      {error ? (
        <p id="summary-range-error" role="alert" className="w-full text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary" onClick={validateCustomRange}>
        Apply Filter
      </button>
    </>
  );
}
