export const PERMISSIONS = {
  // Schedule
  SCHEDULE_IMPORT: "schedule.import",
  SCHEDULE_EDIT: "schedule.edit",
  SCHEDULE_REPAIR: "schedule.repair",
  // Faculty, programs, rooms
  FACULTY_VIEW: "faculty.view",
  FACULTY_MANAGE: "faculty.manage",
  // Attendance
  ATTENDANCE_PRINT: "attendance.print",
  ATTENDANCE_ENCODE: "attendance.encode",
  ATTENDANCE_EDIT_PAST: "attendance.edit_past",
  // Calendar
  CALENDAR_MANAGE: "calendar.manage",
  // Summary
  SUMMARY_VIEW: "summary.view",
  SUMMARY_PRINT: "summary.print",
  SUMMARY_EXPORT: "summary.export",
  // Settings
  SETTINGS_MANAGE: "settings.manage",
  // Users
  USERS_VIEW: "users.view",
  USERS_MANAGE: "users.manage",
  ROLES_MANAGE: "roles.manage",
  // Audit
  AUDIT_VIEW: "audit.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: { name: PermissionKey; description: string }[] = [
  { name: PERMISSIONS.SCHEDULE_IMPORT, description: "Import schedule from Excel" },
  { name: PERMISSIONS.SCHEDULE_EDIT, description: "Edit schedule slots" },
  { name: PERMISSIONS.SCHEDULE_REPAIR, description: "Analyze and repair schedule data before generation" },
  { name: PERMISSIONS.FACULTY_VIEW, description: "View faculty, programs and rooms" },
  { name: PERMISSIONS.FACULTY_MANAGE, description: "Add/edit faculty, programs and rooms" },
  { name: PERMISSIONS.ATTENDANCE_PRINT, description: "Print daily attendance sheets" },
  { name: PERMISSIONS.ATTENDANCE_ENCODE, description: "Encode attendance" },
  { name: PERMISSIONS.ATTENDANCE_EDIT_PAST, description: "Edit past attendance" },
  { name: PERMISSIONS.CALENDAR_MANAGE, description: "Manage holidays and no-class days" },
  { name: PERMISSIONS.SUMMARY_VIEW, description: "View attendance summary" },
  { name: PERMISSIONS.SUMMARY_PRINT, description: "Print attendance summary" },
  { name: PERMISSIONS.SUMMARY_EXPORT, description: "Export summary to Excel" },
  { name: PERMISSIONS.SETTINGS_MANAGE, description: "Edit header, logos and signatory names" },
  { name: PERMISSIONS.USERS_VIEW, description: "View users" },
  { name: PERMISSIONS.USERS_MANAGE, description: "Create/edit users and assign roles" },
  { name: PERMISSIONS.ROLES_MANAGE, description: "Manage roles and permissions" },
  { name: PERMISSIONS.AUDIT_VIEW, description: "View audit history" },
];

// Default Staff permissions (print + encode attendance)
export const STAFF_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.ATTENDANCE_PRINT,
  PERMISSIONS.ATTENDANCE_ENCODE,
  PERMISSIONS.SUMMARY_VIEW,
  PERMISSIONS.SUMMARY_PRINT,
];

export const DEAN_ROLE_NAME = "Dean";
export const STAFF_ROLE_NAME = "Staff";
export const DEAN_ASSISTANT_ROLE_NAME = "Dean's Assistant";
