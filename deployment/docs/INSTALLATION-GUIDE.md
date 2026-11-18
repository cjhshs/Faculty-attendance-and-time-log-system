# Installation Guide: Faculty Attendance and Time Log System

## 1. System Overview
The **Faculty Attendance and Time Log System** is an enterprise attendance encoding, time-tracking, and daily attendance sheet printing platform built with Next.js, React, and PostgreSQL.

This Windows installer packages the application, its production runtime, database migration scripts, background service management, and firewall configurations into an automated, self-contained setup.

---

## 2. System Requirements

* **Operating System**: Windows 10, Windows 11, or Windows Server 2016/2019/2022 (64-bit / x64).
* **Privileges**: Administrator privileges required for installation.
* **Database**: PostgreSQL 14, 15, 16, 17, or 18 (PostgreSQL 18 is recommended).
* **Node.js**: **Not required on target machines**. Node.js runtime is bundled directly inside the application installation.
* **Hardware**:
  * Dual-core CPU or faster.
  * 4 GB RAM minimum (8 GB recommended for host server).
  * 2 GB free disk space.
* **Network**: Ethernet or Wi-Fi connection on a private school/office Local Area Network (LAN).

---

## 3. Step-by-Step Installation

### Step 1: Ensure PostgreSQL is Installed & Running
Before running the installer, ensure PostgreSQL is installed on the host computer. If PostgreSQL is already installed, ensure its Windows Service (`postgresql-x64-XX`) is running.

### Step 2: Run the Installer
1. Right-click `Faculty-Attendance-Installer.exe` and select **Run as administrator**.
2. Select the installation destination directory (default: `C:\Program Files\FacultyAttendance`).

### Step 3: Configure Database Connection
Enter your PostgreSQL credentials:
* **Database Host**: `localhost` (or the IP of your central database server).
* **Port**: `5432` (standard PostgreSQL port).
* **Database Name**: `faculty_attendance_new` (or your preferred database name).
* **User**: `postgres` (or your database administrative user).
* **Password**: Your PostgreSQL password.
* **PostgreSQL Bin Folder**: Leave default (`C:\Program Files\PostgreSQL\18\bin`) or auto-detected.

### Step 4: Configure Application & Initial Administrator
* **Web Port**: `3000` (default). You can change this if port 3000 is used by another application.
* **Administrator Username**: Default `dean`.
* **Administrator Password**: Enter a secure password (minimum 6 characters).

### Step 5: Select Host & Network Options
* **Allow access from other computers on the private LAN**: Checked by default. Creates a Windows Firewall inbound rule for port 3000 restricted to your local network subnet.
* **Create the database if it does not already exist**: Checked by default. Automatically executes `CREATE DATABASE` if the database is not found.
* **Initialize a fresh database**: Checked for fresh installs. Creates reference data, academic terms, roles, and the initial administrator account. *(Automatically disabled during upgrades to prevent data loss)*.
* **Create a Desktop Shortcut**: Creates a Control Panel shortcut on your desktop.

### Step 6: Complete Installation
Click **Install**. The installer will:
1. Copy all production binaries and dependencies.
2. Verify PostgreSQL connectivity.
3. Take a pre-install database backup (if the database already has existing data).
4. Run `prisma migrate deploy` to safely initialize or update database tables.
5. Seed initial reference data (if fresh database initialization was selected).
6. Configure the `FacultyAttendance` Windows background task (runs at Windows startup as `SYSTEM`).
7. Configure the `FacultyAttendanceBackup` automated daily backup task.
8. Configure Windows Firewall.
9. Launch your web browser to `http://localhost:3000/`.

---

## 4. Default Login Credentials (Fresh Installation)

* **Username**: `dean` (or the username entered during setup)
* **Password**: `Dean@12345` (or the password entered during setup)

> [!IMPORTANT]
> The system will prompt you to change your temporary password upon first login.
