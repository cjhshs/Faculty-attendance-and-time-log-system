<#
.SYNOPSIS
    Faculty Attendance and Time Log System - Windows Management Utility
.DESCRIPTION
    Provides service control, LAN address discovery, quick browser access,
    and database backup for administrators.
#>
[CmdletBinding()]
param(
    [ValidateSet("Gui", "Status", "Start", "Stop", "Restart", "Backup", "Open")]
    [string]$Action = "Gui",
    [string]$ConfigPath = (Join-Path $env:ProgramData "FacultyAttendance\app.env")
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

function Show-ManagerCli {
    $status = Get-FacultyServiceStatus -ConfigPath $ConfigPath
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  Faculty Attendance and Time Log System - Service Manager" -ForegroundColor White
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Status:        " -NoNewline
    if ($status.Running) {
        Write-Host "RUNNING" -ForegroundColor Green -NoNewline
        if ($status.ProcessId) { Write-Host " (PID: $($status.ProcessId))" -ForegroundColor Gray } else { Write-Host "" }
    } else {
        Write-Host "STOPPED" -ForegroundColor Red
    }
    Write-Host "Port:          $($status.Port)"
    Write-Host "Scheduled Task:$($status.TaskState)"
    Write-Host "Database:      $($status.Database)"
    Write-Host "Local URL:     $($status.LocalUrl)" -ForegroundColor Yellow
    if ($status.LanUrls.Count -gt 0) {
        Write-Host "LAN URL(s):    " -ForegroundColor Cyan
        foreach ($url in $status.LanUrls) {
            Write-Host "               $url" -ForegroundColor White
        }
    } else {
        Write-Host "LAN Access:    No active non-loopback network adapter found" -ForegroundColor Gray
    }
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
}

switch ($Action) {
    "Status" {
        Show-ManagerCli
        return
    }
    "Start" {
        Write-Host "Starting Faculty Attendance system..." -ForegroundColor Cyan
        $ok = Start-FacultyServiceInstance -ConfigPath $ConfigPath
        if ($ok) {
            Write-Host "System started successfully." -ForegroundColor Green
            Show-ManagerCli
        } else {
            Write-Error "System failed to become ready within timeout. Check logs in C:\ProgramData\FacultyAttendance\logs."
        }
        return
    }
    "Stop" {
        Write-Host "Stopping Faculty Attendance system..." -ForegroundColor Yellow
        Stop-FacultyService -ConfigPath $ConfigPath
        Write-Host "System stopped." -ForegroundColor Green
        return
    }
    "Restart" {
        Write-Host "Restarting Faculty Attendance application..." -ForegroundColor Cyan
        $ok = Restart-FacultyApplication -ConfigPath $ConfigPath
        if ($ok) {
            Write-Host "Application restarted successfully." -ForegroundColor Green
            Show-ManagerCli
        } else {
            Write-Error "Application restart failed. Check logs in C:\ProgramData\FacultyAttendance\logs."
        }
        return
    }
    "Open" {
        $status = Get-FacultyServiceStatus -ConfigPath $ConfigPath
        Start-Process $status.LocalUrl
        return
    }
    "Backup" {
        $backupScript = Join-Path $PSScriptRoot "Backup-Database.ps1"
        & $backupScript -ConfigPath $ConfigPath
        Write-Host "Database backup complete." -ForegroundColor Green
        return
    }
}

# ---------------------------------------------------------------------------
# Native Windows Forms GUI
# ---------------------------------------------------------------------------
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = "Faculty Attendance and Time Log System - Control Panel"
$form.Size = New-Object System.Drawing.Size(620, 520)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)

# Header banner
$headerPanel = New-Object System.Windows.Forms.Panel
$headerPanel.Dock = "Top"
$headerPanel.Height = 70
$headerPanel.BackColor = [System.Drawing.Color]::FromArgb(15, 23, 42)
$form.Controls.Add($headerPanel)

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "Faculty Attendance & Time Log System"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 13, [System.Drawing.FontStyle]::Bold)
$titleLabel.ForeColor = [System.Drawing.Color]::White
$titleLabel.Location = New-Object System.Drawing.Point(20, 12)
$titleLabel.AutoSize = $true
$headerPanel.Controls.Add($titleLabel)

$subtitleLabel = New-Object System.Windows.Forms.Label
$subtitleLabel.Text = "Local Host & LAN Network Deployment Manager"
$subtitleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$subtitleLabel.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
$subtitleLabel.Location = New-Object System.Drawing.Point(22, 38)
$subtitleLabel.AutoSize = $true
$headerPanel.Controls.Add($subtitleLabel)

# Main Container
$contentPanel = New-Object System.Windows.Forms.Panel
$contentPanel.Location = New-Object System.Drawing.Point(20, 85)
$contentPanel.Size = New-Object System.Drawing.Size(565, 380)
$form.Controls.Add($contentPanel)

# Status Group
$statusGroup = New-Object System.Windows.Forms.GroupBox
$statusGroup.Text = " System Status "
$statusGroup.Location = New-Object System.Drawing.Point(0, 0)
$statusGroup.Size = New-Object System.Drawing.Size(565, 110)
$statusGroup.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$contentPanel.Controls.Add($statusGroup)

$statusBadge = New-Object System.Windows.Forms.Label
$statusBadge.Text = "Checking..."
$statusBadge.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$statusBadge.Location = New-Object System.Drawing.Point(20, 26)
$statusBadge.AutoSize = $true
$statusGroup.Controls.Add($statusBadge)

$detailsLabel = New-Object System.Windows.Forms.Label
$detailsLabel.Text = ""
$detailsLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$detailsLabel.ForeColor = [System.Drawing.Color]::FromArgb(71, 85, 105)
$detailsLabel.Location = New-Object System.Drawing.Point(20, 56)
$detailsLabel.Size = New-Object System.Drawing.Size(525, 45)
$statusGroup.Controls.Add($detailsLabel)

# Network URLs Group
$urlGroup = New-Object System.Windows.Forms.GroupBox
$urlGroup.Text = " Access Addresses "
$urlGroup.Location = New-Object System.Drawing.Point(0, 120)
$urlGroup.Size = New-Object System.Drawing.Size(565, 125)
$urlGroup.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$contentPanel.Controls.Add($urlGroup)

$lblLocal = New-Object System.Windows.Forms.Label
$lblLocal.Text = "Local PC Address:"
$lblLocal.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$lblLocal.Location = New-Object System.Drawing.Point(20, 28)
$lblLocal.Size = New-Object System.Drawing.Size(130, 22)
$urlGroup.Controls.Add($lblLocal)

$txtLocal = New-Object System.Windows.Forms.TextBox
$txtLocal.ReadOnly = $true
$txtLocal.BackColor = [System.Drawing.Color]::White
$txtLocal.Font = New-Object System.Drawing.Font("Consolas", 9.5)
$txtLocal.Location = New-Object System.Drawing.Point(155, 25)
$txtLocal.Size = New-Object System.Drawing.Size(280, 24)
$urlGroup.Controls.Add($txtLocal)

$btnOpenLocal = New-Object System.Windows.Forms.Button
$btnOpenLocal.Text = "Open"
$btnOpenLocal.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$btnOpenLocal.Location = New-Object System.Drawing.Point(445, 23)
$btnOpenLocal.Size = New-Object System.Drawing.Size(95, 28)
$urlGroup.Controls.Add($btnOpenLocal)

$lblLan = New-Object System.Windows.Forms.Label
$lblLan.Text = "LAN Access URL:"
$lblLan.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$lblLan.Location = New-Object System.Drawing.Point(20, 65)
$lblLan.Size = New-Object System.Drawing.Size(130, 22)
$urlGroup.Controls.Add($lblLan)

$txtLan = New-Object System.Windows.Forms.TextBox
$txtLan.ReadOnly = $true
$txtLan.BackColor = [System.Drawing.Color]::White
$txtLan.Font = New-Object System.Drawing.Font("Consolas", 9.5)
$txtLan.Location = New-Object System.Drawing.Point(155, 62)
$txtLan.Size = New-Object System.Drawing.Size(280, 24)
$urlGroup.Controls.Add($txtLan)

$btnCopyLan = New-Object System.Windows.Forms.Button
$btnCopyLan.Text = "Copy URL"
$btnCopyLan.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$btnCopyLan.Location = New-Object System.Drawing.Point(445, 60)
$btnCopyLan.Size = New-Object System.Drawing.Size(95, 28)
$urlGroup.Controls.Add($btnCopyLan)

$lblLanHelp = New-Object System.Windows.Forms.Label
$lblLanHelp.Text = "Other computers on the same network can access the system using this LAN URL."
$lblLanHelp.Font = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Italic)
$lblLanHelp.ForeColor = [System.Drawing.Color]::FromArgb(100, 116, 139)
$lblLanHelp.Location = New-Object System.Drawing.Point(155, 95)
$lblLanHelp.Size = New-Object System.Drawing.Size(390, 20)
$urlGroup.Controls.Add($lblLanHelp)

# Action Buttons Panel
$btnPanel = New-Object System.Windows.Forms.Panel
$btnPanel.Location = New-Object System.Drawing.Point(0, 255)
$btnPanel.Size = New-Object System.Drawing.Size(565, 120)
$contentPanel.Controls.Add($btnPanel)

$btnStart = New-Object System.Windows.Forms.Button
$btnStart.Text = "▶ Start System"
$btnStart.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$btnStart.Location = New-Object System.Drawing.Point(0, 10)
$btnStart.Size = New-Object System.Drawing.Size(130, 36)
$btnStart.BackColor = [System.Drawing.Color]::FromArgb(22, 101, 52)
$btnStart.ForeColor = [System.Drawing.Color]::White
$btnStart.FlatStyle = "Flat"
$btnPanel.Controls.Add($btnStart)

$btnStop = New-Object System.Windows.Forms.Button
$btnStop.Text = "⏹ Stop System"
$btnStop.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$btnStop.Location = New-Object System.Drawing.Point(145, 10)
$btnStop.Size = New-Object System.Drawing.Size(130, 36)
$btnStop.BackColor = [System.Drawing.Color]::FromArgb(153, 27, 27)
$btnStop.ForeColor = [System.Drawing.Color]::White
$btnStop.FlatStyle = "Flat"
$btnPanel.Controls.Add($btnStop)

$btnRestart = New-Object System.Windows.Forms.Button
$btnRestart.Text = "🔄 Restart System"
$btnRestart.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$btnRestart.Location = New-Object System.Drawing.Point(290, 10)
$btnRestart.Size = New-Object System.Drawing.Size(130, 36)
$btnPanel.Controls.Add($btnRestart)

$btnBrowse = New-Object System.Windows.Forms.Button
$btnBrowse.Text = "🌐 Open Browser"
$btnBrowse.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$btnBrowse.Location = New-Object System.Drawing.Point(435, 10)
$btnBrowse.Size = New-Object System.Drawing.Size(130, 36)
$btnBrowse.BackColor = [System.Drawing.Color]::FromArgb(30, 58, 138)
$btnBrowse.ForeColor = [System.Drawing.Color]::White
$btnBrowse.FlatStyle = "Flat"
$btnPanel.Controls.Add($btnBrowse)

$btnBackup = New-Object System.Windows.Forms.Button
$btnBackup.Text = "💾 Backup Database Now"
$btnBackup.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$btnBackup.Location = New-Object System.Drawing.Point(0, 58)
$btnBackup.Size = New-Object System.Drawing.Size(180, 32)
$btnPanel.Controls.Add($btnBackup)

$btnOpenBackups = New-Object System.Windows.Forms.Button
$btnOpenBackups.Text = "📂 Open Backups Folder"
$btnOpenBackups.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$btnOpenBackups.Location = New-Object System.Drawing.Point(190, 58)
$btnOpenBackups.Size = New-Object System.Drawing.Size(180, 32)
$btnPanel.Controls.Add($btnOpenBackups)

$btnLogs = New-Object System.Windows.Forms.Button
$btnLogs.Text = "📋 View System Logs"
$btnLogs.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$btnLogs.Location = New-Object System.Drawing.Point(380, 58)
$btnLogs.Size = New-Object System.Drawing.Size(185, 32)
$btnPanel.Controls.Add($btnLogs)

# Status refresh logic
$refreshStatus = {
    $st = Get-FacultyServiceStatus -ConfigPath $ConfigPath
    if ($st.Running) {
        $statusBadge.Text = "🟢 SYSTEM ONLINE (RUNNING)"
        $statusBadge.ForeColor = [System.Drawing.Color]::FromArgb(22, 101, 52)
        $btnStart.Enabled = $false
        $btnStop.Enabled = $true
        $btnRestart.Enabled = $true
        $btnBrowse.Enabled = $true
        $detailsLabel.Text = "Listening on Port $($st.Port) · PID: $(if ($st.ProcessId) { $st.ProcessId } else { 'Service' })`nDatabase: $($st.Database)"
    } else {
        $statusBadge.Text = "🔴 SYSTEM OFFLINE (STOPPED)"
        $statusBadge.ForeColor = [System.Drawing.Color]::FromArgb(153, 27, 27)
        $btnStart.Enabled = $true
        $btnStop.Enabled = $false
        $btnRestart.Enabled = $false
        $btnBrowse.Enabled = $false
        $detailsLabel.Text = "Background service is not running. Click 'Start System' to launch the web application."
    }

    $txtLocal.Text = $st.LocalUrl
    if ($st.LanUrls.Count -gt 0) {
        $txtLan.Text = $st.LanUrls[0]
        $btnCopyLan.Enabled = $true
    } else {
        $txtLan.Text = "No active LAN interface"
        $btnCopyLan.Enabled = $false
    }
}

# Button Click Events
$btnStart.Add_Click({
    $btnStart.Enabled = $false
    $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
    try {
        $ok = Start-FacultyServiceInstance -ConfigPath $ConfigPath
        if (-not $ok) {
            [System.Windows.Forms.MessageBox]::Show("The application process was started, but did not respond on HTTP 200 within timeout. Check logs for details.", "Startup Warning", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
        }
    } catch {
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Startup Error", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error)
    } finally {
        $form.Cursor = [System.Windows.Forms.Cursors]::Default
        & $refreshStatus
    }
})

$btnStop.Add_Click({
    if ([System.Windows.Forms.MessageBox]::Show("Are you sure you want to stop the Faculty Attendance background service?", "Confirm Stop", [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Question) -eq [System.Windows.Forms.DialogResult]::Yes) {
        $btnStop.Enabled = $false
        $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
        try {
            Stop-FacultyService -ConfigPath $ConfigPath
        } finally {
            $form.Cursor = [System.Windows.Forms.Cursors]::Default
            & $refreshStatus
        }
    }
})

$btnRestart.Add_Click({
    $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
    try {
        $ok = Restart-FacultyApplication -ConfigPath $ConfigPath
        if (-not $ok) {
            [System.Windows.Forms.MessageBox]::Show("The application process was restarted, but did not respond with HTTP 200 within timeout. Check logs in C:\ProgramData\FacultyAttendance\logs for details.", "Restart Warning", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning)
        }
    } catch {
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Restart Error", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error)
    } finally {
        $form.Cursor = [System.Windows.Forms.Cursors]::Default
        & $refreshStatus
    }
})

$btnOpenLocal.Add_Click({
    if ($txtLocal.Text) { Start-Process $txtLocal.Text }
})

$btnBrowse.Add_Click({
    if ($txtLocal.Text) { Start-Process $txtLocal.Text }
})

$btnCopyLan.Add_Click({
    if ($txtLan.Text -and $txtLan.Text -notlike "*No active*") {
        [System.Windows.Forms.Clipboard]::SetText($txtLan.Text)
        [System.Windows.Forms.MessageBox]::Show("LAN URL copied to clipboard:`n$($txtLan.Text)", "Copied", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)
    }
})

$btnBackup.Add_Click({
    $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
    try {
        $backupScript = Join-Path $PSScriptRoot "Backup-Database.ps1"
        & $backupScript -ConfigPath $ConfigPath
        [System.Windows.Forms.MessageBox]::Show("Database backup created successfully in:`nC:\ProgramData\FacultyAttendance\backups", "Backup Complete", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)
    } catch {
        [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Backup Error", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Error)
    } finally {
        $form.Cursor = [System.Windows.Forms.Cursors]::Default
    }
})

$btnOpenBackups.Add_Click({
    $backupDir = Join-Path $env:ProgramData "FacultyAttendance\backups"
    if (-not (Test-Path -LiteralPath $backupDir)) {
        New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    }
    Start-Process "explorer.exe" $backupDir
})

$btnLogs.Add_Click({
    $logDir = Join-Path $env:ProgramData "FacultyAttendance\logs"
    if (Test-Path -LiteralPath $logDir) {
        $latest = Get-ChildItem -LiteralPath $logDir -Filter "*.log" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($latest) {
            Start-Process "notepad.exe" $latest.FullName
        } else {
            Start-Process "explorer.exe" $logDir
        }
    } else {
        [System.Windows.Forms.MessageBox]::Show("Logs directory does not exist yet.", "Logs", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information)
    }
})

# Initial refresh
& $refreshStatus

# Timer to auto-update status every 4 seconds
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 4000
$timer.Add_Tick({ & $refreshStatus })
$timer.Start()

$form.Add_FormClosed({
    $timer.Stop()
    $timer.Dispose()
})

[void]$form.ShowDialog()
