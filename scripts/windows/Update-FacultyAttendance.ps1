<#
.SYNOPSIS
    Safely update an existing Faculty Attendance and Time Log System installation.
.DESCRIPTION
    Stops the background service, takes an automated pre-update database backup,
    applies pending migrations, restarts the service, and verifies application health.
#>
[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $env:ProgramData "FacultyAttendance\app.env")
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

$root = Get-FacultyInstallRoot
$appRoot = Join-Path $root "app"
$resolvedConfig = Get-FacultyConfigPath -Path $ConfigPath
$dataRoot = Split-Path -Parent $resolvedConfig
$logDir = Join-Path $dataRoot "logs"
$updateLog = Join-Path $logDir "update.log"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

Write-FacultyLog -Message "Starting application update process..." -LogPath $updateLog

if (-not (Test-FacultyAdministrator)) {
    throw "Update must be executed as Administrator."
}

if (-not (Test-Path -LiteralPath $resolvedConfig)) {
    throw "Existing configuration not found at $resolvedConfig. Use fresh installation instead."
}

# 1. Stop the application service
Write-FacultyLog -Message "Stopping background service..." -LogPath $updateLog
Stop-FacultyService -ConfigPath $resolvedConfig

# 2. Automated Pre-Update Database Backup
Write-FacultyLog -Message "Creating pre-update database backup..." -LogPath $updateLog
$backupScript = Join-Path $PSScriptRoot "Backup-Database.ps1"
& $backupScript -ConfigPath $resolvedConfig -Prefix "preupdate"
if ($LASTEXITCODE -ne 0) {
    throw "Pre-update database backup failed. Aborting update to protect data."
}

# 3. Apply pending Prisma migrations
Write-FacultyLog -Message "Applying database migrations..." -LogPath $updateLog
$config = Read-FacultyEnvFile -Path $resolvedConfig
$env:DATABASE_URL = $config["DATABASE_URL"]
$node = Get-FacultyNodePath
$prismaCli = Join-Path $appRoot "node_modules\prisma\build\index.js"
& $node $prismaCli migrate deploy --schema (Join-Path $appRoot "prisma\schema.prisma")
if ($LASTEXITCODE -ne 0) {
    throw "Prisma migration failed. Please restore the pre-update backup."
}

# 4. Restart the application service
Write-FacultyLog -Message "Restarting application service..." -LogPath $updateLog
$ready = Start-FacultyServiceInstance -ConfigPath $resolvedConfig -TimeoutSeconds 60
if (-not $ready) {
    throw "Application did not respond on HTTP 200 after update. Check logs in $logDir."
}

Write-FacultyLog -Message "Application update completed successfully!" -LogPath $updateLog
Write-Host "Update completed successfully! System is running." -ForegroundColor Green
