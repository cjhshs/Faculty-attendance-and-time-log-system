import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser, hasPermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { buildSummary } from "@/lib/summary";
import { parseISODate, cutoffRange, formatLong } from "@/lib/dates";
import { writeAudit } from "@/lib/audit";

export const maxDuration = 60;

function uniqueSheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[\\/?*[\]:]/g, " ").trim() || "Faculty").slice(0, 31);
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!hasPermission(user, PERMISSIONS.SUMMARY_EXPORT)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const url = new URL(request.url);
  const def = cutoffRange();
  const start = parseISODate(url.searchParams.get("start")) ?? def.start;
  const end = parseISODate(url.searchParams.get("end")) ?? def.end;
  if (start > end) return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  if ((end.getTime() - start.getTime()) / 86400000 > 366) {
    return NextResponse.json({ error: "Date range is too large." }, { status: 400 });
  }

  const programCode = url.searchParams.get("program");
  const course = programCode ? await prisma.course.findUnique({ where: { code: programCode } }) : null;

  const summary = await buildSummary(start, end, course?.id);
  const generated = new Date().toISOString().slice(0, 10);
  const rangeLabel = `${formatLong(start)} to ${formatLong(end)}`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Faculty Attendance System";
  workbook.created = new Date();

  // ----- Overall summary -----
  const overall = workbook.addWorksheet("Overall Summary");
  overall.columns = [
    { width: 34 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 13 },
    { width: 13 },
    { width: 13 },
  ];
  overall.mergeCells("A1:G1");
  overall.getCell("A1").value = "ATTENDANCE SUMMARY";
  overall.getCell("A1").font = { bold: true, size: 14 };
  overall.mergeCells("A2:G2");
  overall.getCell("A2").value = `Range: ${rangeLabel}   |   Generated: ${generated}${
    course ? `   |   Program: ${course.code}` : ""
  }`;
  overall.mergeCells("A3:G3");
  overall.getCell("A3").value = `Faculty: ${summary.totals.facultyCount}   Encoded scheduled hrs: ${summary.totals.scheduledHours}   Present hrs: ${summary.totals.presentHours}   Absent hrs: ${summary.totals.absentHours}`;
  if (summary.incomplete.length > 0) {
    overall.mergeCells("A4:G4");
    overall.getCell("A4").value = `INCOMPLETE: ${summary.incomplete.length} date/program scope(s) not encoded and excluded from absent hours: ${summary.incomplete
      .map((i) => `${i.date} ${i.course}`)
      .join("; ")}`;
    overall.getCell("A4").font = { color: { argb: "FF9A3412" }, bold: true };
  }

  const headerRow = overall.addRow([
    "Faculty",
    "Scheduled hrs",
    "Present hrs",
    "Absent hrs",
    "Present days",
    "Absent days",
    "Partial days",
  ]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E7" } };
    cell.border = thinBorder();
  });
  for (const f of summary.faculty) {
    const row = overall.addRow([
      f.name,
      f.encodedScheduledHours,
      f.presentHours,
      f.absentHours,
      f.presentDays,
      f.absentDays,
      f.partialDays,
    ]);
    row.eachCell((cell) => (cell.border = thinBorder()));
  }

  // ----- One sheet per faculty -----
  const used = new Set<string>(["overall summary"]);
  for (const f of summary.faculty) {
    const ws = workbook.addWorksheet(uniqueSheetName(f.name, used));
    ws.columns = [
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 16 },
    ];
    ws.mergeCells("A1:F1");
    ws.getCell("A1").value = f.name;
    ws.getCell("A1").font = { bold: true, size: 13 };
    ws.mergeCells("A2:F2");
    ws.getCell("A2").value = `Range: ${rangeLabel}   |   Generated: ${generated}`;

    const head = ws.addRow([
      "Date",
      "Program",
      "Scheduled hrs",
      "Present hrs",
      "Absent hrs",
      "Status",
    ]);
    head.font = { bold: true };
    head.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E7" } };
      cell.border = thinBorder();
    });

    for (const d of f.daily) {
      const row = ws.addRow([
        d.date,
        d.course,
        d.scheduledHours,
        d.presentHours,
        d.absentHours,
        d.encoded ? "Saved" : "Not encoded",
      ]);
      row.eachCell((cell) => (cell.border = thinBorder()));
    }

    const totals = ws.addRow([
      "TOTAL",
      "",
      f.encodedScheduledHours,
      f.presentHours,
      f.absentHours,
      `${f.presentDays}P / ${f.absentDays}A / ${f.partialDays}partial days`,
    ]);
    totals.font = { bold: true };
    totals.eachCell((cell) => (cell.border = thinBorder()));

    if (f.reasons.length > 0) {
      ws.addRow([]);
      const rh = ws.addRow(["Absence reasons", "Date", "Reason"]);
      rh.font = { bold: true };
      for (const r of f.reasons) {
        ws.addRow(["", r.date, `${r.course}: ${r.reason}`]);
      }
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  await writeAudit(
    user.id,
    "summary.export",
    `Exported summary ${start.toISOString().slice(0, 10)}..${end.toISOString().slice(0, 10)}${
      course ? ` (${course.code})` : ""
    }`,
  );

  return new NextResponse(Buffer.from(arrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attendance-summary-${start
        .toISOString()
        .slice(0, 10)}_${end.toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}
