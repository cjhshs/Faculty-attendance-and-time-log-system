import { Fragment } from "react";
import { buildProgramSheet, paginateColumns, type SheetSlot } from "@/lib/attendance-sheet";
import { formatLong } from "@/lib/dates";
import logo1 from "@/app/logo/logo1.png";
import logo2 from "@/app/logo/logo2.png";

export type SheetCourse = {
  id: number;
  code: string;
  name: string | null;
  collegeName?: string | null;
};
export type SheetHeaderData = {
  schoolHeader: string;
  collegeHeader: string;
  address: string;
  schoolLogo: string;
  collegeLogo: string;
  preparedBy: string;
  checkedBy: string;
  preparedDesignation?: string;
  checkedDesignation?: string;
};

export function AttendanceSheets({
  date,
  header,
  courses,
  slotsByCourse,
  noClassLabel,
  onlyPage,
  pageOffset = 0,
  totalPages: totalPagesOverride,
}: {
  date: Date;
  header: SheetHeaderData;
  courses: SheetCourse[];
  slotsByCourse: { course: SheetCourse; slots: SheetSlot[] }[];
  noClassLabel?: string | null;
  // When set, only this 1-based page of the stable paginated document is
  // rendered. Page boundaries are computed from the data, not from CSS.
  onlyPage?: number | null;
  // Global page numbering for multi-day documents: the first page of this set
  // is `pageOffset + 1`, and footers report the document-wide total.
  pageOffset?: number;
  totalPages?: number;
}) {
  // No-class day: print the note instead of the class grid (staff may still print).
  if (noClassLabel) {
    const list = courses.length > 0 ? courses : [{ id: 0, code: "", name: null }];
    const total = list.length;
    const selected = onlyPage ? list[onlyPage - 1] : undefined;
    return (
      <div className="space-y-8">
        {(onlyPage ? (selected ? [selected] : []) : list).map((course, index) => (
          <section key={course.id} className="print-sheet mb-8 bg-white p-3 shadow-sm">
            <SheetHead date={date} header={header} course={course} />
            <p className="my-16 text-center text-base font-bold">
              No class &ndash; {noClassLabel}
            </p>
            <SheetFoot
              header={header}
              pageNumber={pageOffset + (onlyPage ?? index + 1)}
              totalPages={totalPagesOverride ?? total}
            />
          </section>
        ))}
      </div>
    );
  }

  // Build every page up front. The same deterministic pagination is used by
  // print-all and print-page-N, so page N is byte-for-byte the same sheet.
  const programs = slotsByCourse.map(({ course, slots }) => {
    const sheet = buildProgramSheet(slots);
    return { course, sheet, pages: paginateColumns(sheet.columns) };
  });
  const computedTotal = programs.reduce((n, program) => n + program.pages.length, 0);

  const rendered: React.ReactNode[] = [];
  let pageNumber = pageOffset;
  for (const program of programs) {
    for (let pageIndex = 0; pageIndex < program.pages.length; pageIndex++) {
      pageNumber += 1;
      if (onlyPage && pageNumber !== pageOffset + onlyPage) continue;
      rendered.push(
        <ProgramSheetPage
          key={`${program.course.id}-${pageIndex}`}
          date={date}
          header={header}
          course={program.course}
          sheet={program.sheet}
          pageColumns={program.pages[pageIndex]}
          showUnassigned={pageIndex === 0}
          pageNumber={pageNumber}
          totalPages={totalPagesOverride ?? computedTotal}
        />,
      );
    }
  }

  return (
    <div className="space-y-8">
      {rendered}
      {slotsByCourse.length === 0 ? (
        <p className="text-sm text-muted">No scheduled classes for the selected date and programs.</p>
      ) : null}
    </div>
  );
}

function ProgramSheetPage({
  date,
  header,
  course,
  sheet,
  pageColumns,
  showUnassigned,
  pageNumber,
  totalPages,
}: {
  date: Date;
  header: SheetHeaderData;
  course: SheetCourse;
  sheet: ReturnType<typeof buildProgramSheet>;
  pageColumns: ReturnType<typeof paginateColumns>[number];
  showUnassigned: boolean;
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <section className="print-sheet mb-8 bg-white p-3 shadow-sm">
      <SheetHead date={date} header={header} course={course} />

      {sheet.unassigned.length > 0 && showUnassigned ? (
        <p className="mb-2 border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 print:hidden">
          Unassigned (TBA) classes not shown as faculty columns:{" "}
          {sheet.unassigned.map((u) => `${u.cn} ${u.subject} ${u.time}`).join("; ")}
        </p>
      ) : null}

      <table className="w-full border-collapse text-[11px] leading-tight">
        <thead>
          <tr>
            <th rowSpan={2} className="border border-black px-1 py-0.5 text-center">
              TIME
            </th>
            {pageColumns.map((col) => (
              <th
                key={col.facultyId}
                colSpan={2}
                className="border border-black px-1 py-0.5 text-center font-bold"
              >
                {col.label}
              </th>
            ))}
          </tr>
          <tr>
            {pageColumns.map((col) => (
              <Fragment key={col.facultyId}>
                <th className="border border-black px-1 py-0.5 text-center text-[10px]">ROOM</th>
                <th className="border border-black px-1 py-0.5 text-center text-[10px]">
                  &#10003;
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, rowIndex) => (
            <tr key={row.start}>
              <td className="whitespace-nowrap border border-black px-1 py-0.5 text-center">
                {row.label}
              </td>
              {pageColumns.map((col) => {
                const cell = col.cells[rowIndex];
                if (cell === "empty") {
                  return (
                    <Fragment key={col.facultyId}>
                      <td className="border border-black bg-zinc-50" />
                      <td className="border border-black bg-zinc-50" />
                    </Fragment>
                  );
                }
                if (cell === "covered") {
                  return (
                    <td key={`${col.facultyId}-c`} className="border border-black text-center">
                      &nbsp;
                    </td>
                  );
                }
                return (
                  <Fragment key={col.facultyId}>
                    <td
                      rowSpan={cell.rowSpan}
                      className="border border-black px-1 py-0.5 text-center align-middle"
                    >
                      {cell.room === "TBA" ? (
                        <span className="inline-flex flex-col items-center">
                          <span>TBA</span>
                          <span className="mt-1 block h-3 w-10 border-b border-black" />
                        </span>
                      ) : (
                        cell.room
                      )}
                    </td>
                    <td className="border border-black text-center">&nbsp;</td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <SheetFoot header={header} pageNumber={pageNumber} totalPages={totalPages} />
    </section>
  );
}

function SheetHead({
  date,
  header,
  course,
}: {
  date: Date;
  header: SheetHeaderData;
  course: SheetCourse;
}) {
  const leftLogo = header.schoolLogo || logo1.src;
  const rightLogo = header.collegeLogo || logo2.src;
  return (
    <div className="mb-2">
      <div className="flex items-center justify-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={leftLogo} alt="School logo" className="h-14 w-14 shrink-0 object-contain" />
        <div className="text-center">
          <p className="text-sm font-bold">{header.schoolHeader}</p>
          <p className="text-sm font-semibold">{header.collegeHeader}</p>
          <p className="text-[11px]">{header.address}</p>
          <p className="mt-1 text-base font-bold tracking-widest">ATTENDANCE</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={rightLogo} alt="College logo" className="h-14 w-14 shrink-0 object-contain" />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between text-[11px]">
        <span>
          <strong>DATE:</strong> {formatLong(date)}
        </span>
        <span>
          <strong>COLLEGE:</strong> {course.collegeName ?? "UNASSIGNED"}
        </span>
        <span>
          <strong>PROGRAM:</strong> {course.code}
        </span>
      </div>
    </div>
  );
}

function SheetFoot({
  header,
  pageNumber,
  totalPages,
}: {
  header: SheetHeaderData;
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <div className="mt-3 text-[11px]">
      <p className="mb-2 italic">
        Legend: &#10003; = present; blank = not encoded. A blank is never counted as an absence
        until staff explicitly marks it absent.
      </p>
      <div className="flex items-end justify-between gap-8">
        <div className="min-w-0">
          <p className="text-[10px]">Prepared by:</p>
          <p className="mt-8 w-56 border-t border-black px-1 pt-1 text-center font-semibold">
            {header.preparedBy || "\u00a0"}
          </p>
          {header.preparedDesignation ? (
            <p className="w-56 text-center text-[10px] italic">{header.preparedDesignation}</p>
          ) : null}
        </div>
        <p className="shrink-0 text-[10px] text-zinc-600">
          Page {pageNumber} of {totalPages}
        </p>
        <div className="min-w-0 ml-auto">
          <p className="text-[10px]">Checked by:</p>
          <p className="mt-8 w-56 border-t border-black px-1 pt-1 text-center font-semibold">
            {header.checkedBy || "\u00a0"}
          </p>
          {header.checkedDesignation ? (
            <p className="w-56 text-center text-[10px] italic">{header.checkedDesignation}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
