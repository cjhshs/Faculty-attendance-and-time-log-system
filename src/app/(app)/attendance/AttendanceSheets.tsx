import { Fragment } from "react";
import { buildProgramSheet, paginateColumns, type SheetSlot } from "@/lib/attendance-sheet";
import { formatLong } from "@/lib/dates";
import logo1 from "@/app/logo/logo1.png";
import logo2 from "@/app/logo/logo2.png";

export type SheetCourse = { id: number; code: string; name: string | null };
export type SheetHeaderData = {
  schoolHeader: string;
  collegeHeader: string;
  address: string;
  schoolLogo: string;
  collegeLogo: string;
  preparedBy: string;
  checkedBy: string;
};

export function AttendanceSheets({
  date,
  header,
  courses,
  slotsByCourse,
  noClassLabel,
}: {
  date: Date;
  header: SheetHeaderData;
  courses: SheetCourse[];
  slotsByCourse: { course: SheetCourse; slots: SheetSlot[] }[];
  noClassLabel?: string | null;
}) {
  // No-class day: print the note instead of the class grid (staff may still print).
  if (noClassLabel) {
    const list = courses.length > 0 ? courses : [{ id: 0, code: "", name: null }];
    return (
      <div className="space-y-8">
        {list.map((course) => (
          <section key={course.id} className="print-sheet mb-8 bg-white p-3 shadow-sm">
            <SheetHead date={date} header={header} course={course} />
            <p className="my-16 text-center text-base font-bold">
              No class &ndash; {noClassLabel}
            </p>
            <SheetFoot header={header} />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {slotsByCourse.map(({ course, slots }) => (
        <ProgramSheetView key={course.id} date={date} header={header} course={course} slots={slots} />
      ))}
      {slotsByCourse.length === 0 ? (
        <p className="text-sm text-muted">No scheduled classes for the selected date and programs.</p>
      ) : null}
    </div>
  );
}

function ProgramSheetView({
  date,
  header,
  course,
  slots,
}: {
  date: Date;
  header: SheetHeaderData;
  course: SheetCourse;
  slots: SheetSlot[];
}) {
  const sheet = buildProgramSheet(slots);
  const pages = paginateColumns(sheet.columns);

  return (
    <>
      {pages.map((pageColumns, pageIndex) => (
        <section key={pageIndex} className="print-sheet mb-8 bg-white p-3 shadow-sm">
          <SheetHead date={date} header={header} course={course} />

          {sheet.unassigned.length > 0 && pageIndex === 0 ? (
            <p className="mb-2 border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
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

          <SheetFoot header={header} />
        </section>
      ))}
    </>
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
          <strong>PROGRAM:</strong> {course.code}
        </span>
      </div>
    </div>
  );
}

function SheetFoot({ header }: { header: SheetHeaderData }) {
  return (
    <div className="mt-3 text-[11px]">
      <p className="mb-2 italic">
        Legend: &#10003; = present; blank after saved encoding = absent; TBA = write in the actual room.
      </p>
      <div className="flex items-end justify-between gap-8">
        <div>
          <p className="text-[10px]">Prepared by:</p>
          <p className="mt-3 border-t border-black px-6 text-center font-semibold">
            {header.preparedBy || "\u00a0"}
          </p>
        </div>
        <div>
          <p className="text-[10px]">Checked by:</p>
          <p className="mt-3 border-t border-black px-6 text-center font-semibold">
            {header.checkedBy || "\u00a0"}
          </p>
        </div>
      </div>
    </div>
  );
}
