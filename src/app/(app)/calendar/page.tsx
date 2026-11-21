import { requirePermission } from "@/lib/session";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ActionForm, ActionButton } from "../ActionForm";
import { addHoliday, addHolidayRange, deleteHoliday } from "./actions";

export default async function CalendarPage() {
  await requirePermission(PERMISSIONS.CALENDAR_MANAGE);
  const holidays = await prisma.holiday.findMany({ orderBy: { date: "asc" } });

  return (
    <div className="space-y-6">
      <h1 className="page-title">No-class Calendar</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 section-title">Add a single date</h2>
          <ActionForm action={addHoliday} submitLabel="Add date" resetOnSuccess>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="hdate">
                  Date
                </label>
                <input id="hdate" type="date" name="date" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="hlabel">
                  Label
                </label>
                <input id="hlabel" name="label" className="input" placeholder="Holiday" />
              </div>
            </div>
          </ActionForm>
        </section>

        <section className="card">
          <h2 className="mb-3 section-title">Add a date range</h2>
          <ActionForm action={addHolidayRange} submitLabel="Add range" resetOnSuccess>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="start">
                  Start
                </label>
                <input id="start" type="date" name="start" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="end">
                  End
                </label>
                <input id="end" type="date" name="end" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="rlabel">
                  Label
                </label>
                <input id="rlabel" name="label" className="input" placeholder="Class suspension" />
              </div>
            </div>
          </ActionForm>
        </section>
      </div>

      <section className="card">
        <h2 className="mb-3 section-title">No-class dates ({holidays.length})</h2>
        <div
          role="region"
          aria-label="No-class dates"
          tabIndex={0}
          className="scroll-region max-h-96 overflow-auto"
        >
          <table className="data-table">
            <caption className="visually-hidden">No-class dates</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Label</th>
                <th scope="col" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id}>
                  <td>{h.date.toISOString().slice(0, 10)}</td>
                  <td>{h.label}</td>
                  <td>
                    <ActionButton
                      action={deleteHoliday}
                      label="Delete"
                      variant="danger"
                      fields={{ id: h.id }}
                      confirm={`Remove "${h.label}"?`}
                    />
                  </td>
                </tr>
              ))}
              {holidays.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center text-muted">
                    No no-class dates recorded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
