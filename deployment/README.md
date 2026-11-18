# Faculty Attendance and Time Log System - Deployment Package

Welcome to the production deployment package for the **Faculty Attendance and Time Log System**.

This package contains everything required to deploy, host, and manage the system on Windows computers across a school or institutional Local Area Network (LAN).

---

## 📦 Package Contents

| Deliverable | Location | Description |
| :--- | :--- | :--- |
| **1. Windows Installer** | `Faculty-Attendance-Installer.exe` | Complete self-contained graphical Windows installer with bundled Node.js runtime and automated service registration. |
| **2. Installer Source Files** | `installer/FacultyAttendance.iss` | Full Inno Setup 6 source script with custom wizard pages, registry checks, and uninstaller hooks. |
| **3. Production Configuration** | `config/app.env.example` | Production environment template with database URL, session secrets, bind address, and logging paths. |
| **4. Database Setup & Migrations**| `scripts/Setup-FacultyAttendance.ps1`, `prisma/` | Automated database creation, pre-migration backups, `prisma migrate deploy`, and reference seeding. |
| **5. Backup & Restoration** | `scripts/Backup-Database.ps1`, `scripts/Restore-Database.ps1` | Automated 02:00 AM daily backups with 30-day retention, manual backups, and verified restoration. |
| **6. Service Management Utility** | `scripts/FacultyAttendanceManager.ps1`, `.bat` | Graphical control panel for Start, Stop, Restart, live status, database backup, and LAN URL discovery. |
| **7. Update Mechanism** | `scripts/Update-FacultyAttendance.ps1`, `docs/UPDATE-GUIDE.md` | Non-destructive update pipeline with pre-update database snapshots and rollback procedures. |
| **8. Installation Documentation** | `docs/INSTALLATION-GUIDE.md` | Complete administrator setup guide with step-by-step instructions and requirements. |
| **9. LAN Access Guide** | `docs/LAN-ACCESS-GUIDE.md` | Guide for accessing the system from other PCs across the network, IP discovery, and firewall rules. |
| **10. Troubleshooting Guide** | `docs/TROUBLESHOOTING.md` | Diagnostics, common error solutions, port changes, and disaster recovery. |

---

## 🚀 Quick Start for Administrators

1. **Install PostgreSQL**: Ensure PostgreSQL (version 14–18) is installed on the host computer.
2. **Run Installer**: Right-click `Faculty-Attendance-Installer.exe` and select **Run as administrator**.
3. **Follow Wizard**:
   * Enter your PostgreSQL password.
   * Choose whether to enable LAN access (default: **Yes**).
   * Leave default port **3000** or customize as needed.
4. **Access the System**:
   * **Host computer**: [http://localhost:3000/](http://localhost:3000/)
   * **Other computers on LAN**: `http://<HOST-IP>:3000/` *(find your host IP easily in the Control Panel)*.
5. **Control Panel**: Use the desktop shortcut **Faculty Attendance Control Panel** to start, stop, restart, or back up the system at any time.
