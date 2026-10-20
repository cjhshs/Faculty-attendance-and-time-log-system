import { hoursOfRange, timeToMinutes, minutesToTime } from "@/lib/dates";

export type ParsedMeeting = {
  weekdays: number[]; // 0=Sunday .. 6=Saturday
  start: string; // HH:mm
  end: string; // HH:mm
  roomCode: string;
  roomType: "PHYSICAL" | "ONLINE" | "TBA";
  mode: "FACE_TO_FACE" | "ONLINE" | "LAB";
  isLab: boolean;
  raw: string;
};

export type ParseError = {
  raw: string;
  message: string;
};

// A single class meeting is at most a full working day. Anything longer is a
// data-entry error (for example "06:00 AM-06:00" that was meant to be an hour),
// so we flag it instead of importing an impossible block.
export const MAX_MEETING_MINUTES = 8 * 60;

const DAY_TOKENS: Record<string, number> = {
  su: 0,
  sun: 0,
  sunday: 0,
  m: 1,
  mon: 1,
  monday: 1,
  t: 2,
  tu: 2,
  tue: 2,
  tues: 2,
  tuesday: 2,
  w: 3,
  wed: 3,
  wednesday: 3,
  th: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  f: 5,
  fri: 5,
  friday: 5,
  s: 6,
  sat: 6,
  saturday: 6,
};

const NON_ROOM = new Set(["ASYNC", "OLC", "TBA"]);

export function normaliseFacultyName(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function surnameOf(fullName: string): string {
  const cleaned = normaliseFacultyName(fullName);
  if (cleaned.includes(",")) return cleaned.split(",")[0].trim();
  const parts = cleaned.split(" ");
  return parts[parts.length - 1];
}

export function nameKey(fullName: string): string {
  return normaliseFacultyName(fullName).toLowerCase();
}

function parseClock(hourMinutes: string, meridiem: string | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hourMinutes.trim());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (minute > 59) return null;
  const mer = meridiem?.toUpperCase();
  if (mer === "AM" || mer === "PM") {
    if (hour < 1 || hour > 12) return null;
    if (mer === "AM") hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  } else {
    if (hour > 23) return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Resolve the stored end time for one entry. The school form frequently omits
// the meridiem on the end time ("04:00 PM-05:00"): inherit the start's period,
// then roll forward 12 hours when the end lands before the start. A zero-length
// or still-backwards interval is an error, never a guess.
export function resolveEndTime(
  start: string,
  end: string,
  endHasMeridiem: boolean,
): { end: string } | { error: string } {
  const startMin = timeToMinutes(start);
  let endMin = timeToMinutes(end);
  if (endMin === startMin) {
    return { error: "End time must be after the start time." };
  }
  if (endMin < startMin) {
    if (endHasMeridiem) {
      return { error: "End time is before the start time." };
    }
    const shifted = endMin + 12 * 60;
    if (shifted >= 24 * 60 || shifted <= startMin) {
      return { error: "End time is before the start time." };
    }
    endMin = shifted;
  }
  if (endMin - startMin > MAX_MEETING_MINUTES) {
    return { error: `Meeting is longer than ${MAX_MEETING_MINUTES / 60} hours.` };
  }
  return { end: minutesToTime(endMin) };
}

const ENTRY_REGEX =
  /^([A-Za-z]+(?:\/[A-Za-z]+)*)\s+(\d{1,2}:\d{2})\s*([APap][Mm])?\s*-\s*(\d{1,2}:\d{2})\s*([APap][Mm])?\s+(.+)$/;

// Parse a single Schedule cell into collapsed class meetings. Entries that share
// the same weekday set and time are alternative modes of one meeting; the room
// is chosen with the physical-first rule and ASYNC is never used as a room.
export function parseScheduleCell(cell: string): { meetings: ParsedMeeting[]; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const parts = String(cell ?? "")
    .split("||")
    .map((p) => p.trim())
    .filter(Boolean);

  type Intermediate = {
    weekdays: number[];
    start: string;
    end: string;
    places: { code: string; isLab: boolean }[];
    raw: string;
  };

  const groups = new Map<string, Intermediate>();

  for (const part of parts) {
    const match = ENTRY_REGEX.exec(part);
    if (!match) {
      errors.push({ raw: part, message: "Could not parse schedule entry." });
      continue;
    }
    const [, daysRaw, startRaw, startMer, endRaw, endMer, placeRaw] = match;

    const dayTokens = daysRaw.split("/").map((d) => d.trim()).filter(Boolean);
    const weekdays: number[] = [];
    let badDay: string | null = null;
    for (const token of dayTokens) {
      const wd = DAY_TOKENS[token.toLowerCase()];
      if (wd === undefined) {
        badDay = token;
        break;
      }
      if (!weekdays.includes(wd)) weekdays.push(wd);
    }
    if (badDay) {
      errors.push({ raw: part, message: `Unknown day token "${badDay}".` });
      continue;
    }
    if (weekdays.length === 0) {
      errors.push({ raw: part, message: "No days listed." });
      continue;
    }

    const start = parseClock(startRaw, startMer);
    const end = parseClock(endRaw, endMer ?? startMer);
    if (!start || !end) {
      errors.push({ raw: part, message: "Unreadable time. Use a 12-hour time such as 10:00 AM." });
      continue;
    }
    const resolved = resolveEndTime(start, end, Boolean(endMer));
    if ("error" in resolved) {
      errors.push({ raw: part, message: resolved.error });
      continue;
    }
    const endTime = resolved.end;

    let place = placeRaw.trim();
    let isLab = false;
    // Accept any trailing parenthetical lab qualifier, e.g. "(Lab)" or
    // "(CE LAB)", so the room code is the bare room and the lab flag is kept.
    // Some cells stack qualifiers ("AGM102 (CE LAB) (Lab)"), so strip repeatedly.
    for (;;) {
      const labMatch = /\([^)]*\blab\b[^)]*\)\s*$/i.exec(place);
      if (!labMatch) break;
      isLab = true;
      place = place.slice(0, labMatch.index).trim();
    }
    if (!place) {
      errors.push({ raw: part, message: "Missing room or mode token." });
      continue;
    }

    weekdays.sort((a, b) => a - b);
    const key = `${weekdays.join(",")}|${start}|${endTime}`;
    const existing = groups.get(key);
    if (existing) {
      existing.places.push({ code: place, isLab });
    } else {
      groups.set(key, { weekdays, start, end: endTime, places: [{ code: place, isLab }], raw: part });
    }
  }

  const meetings: ParsedMeeting[] = [];

  for (const group of groups.values()) {
    const physical = group.places.find((p) => !NON_ROOM.has(p.code.toUpperCase()));
    const olc = group.places.find((p) => p.code.toUpperCase() === "OLC");
    const tba = group.places.find((p) => p.code.toUpperCase() === "TBA");
    const isLab = physical?.isLab ?? group.places.some((p) => p.isLab);

    let roomCode: string;
    let roomType: ParsedMeeting["roomType"];
    let mode: ParsedMeeting["mode"];

    if (physical) {
      roomCode = physical.code;
      roomType = "PHYSICAL";
      mode = physical.isLab ? "LAB" : "FACE_TO_FACE";
    } else if (olc) {
      roomCode = "OLC";
      roomType = "ONLINE";
      mode = "ONLINE";
    } else if (tba) {
      roomCode = "TBA";
      roomType = "TBA";
      mode = "FACE_TO_FACE";
    } else {
      // Only ASYNC-like tokens remain. ASYNC is never printed as a room and the
      // schedule does not establish a valid room, so flag the meeting instead of
      // silently turning it into an online OLC class.
      errors.push({
        raw: group.raw,
        message: "No valid room: only ASYNC was listed (physical room, OLC, or TBA required).",
      });
      continue;
    }

    meetings.push({
      weekdays: group.weekdays,
      start: group.start,
      end: group.end,
      roomCode,
      roomType,
      mode,
      isLab,
      raw: group.raw,
    });
  }

  return { meetings, errors };
}

export { hoursOfRange };
