# Start PostgreSQL safely on Windows.
#
# This script never initializes a cluster, never deletes data, never changes the
# port, and never edits pg_hba.conf/postgresql.conf. It only starts the existing
# PostgreSQL Windows service (requesting elevation when needed) and verifies that
# the server accepts connections.
#
# Usage (normal shell):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Start-PostgreSQL.ps1
#
# Explicit service name:
#   ... -ServiceName postgresql-x64-18
#
# If PostgreSQL was installed without a Windows service, pass the existing binary
# and data directories so pg_ctl can start the existing cluster:
#   ... -PgBin "C:\Program Files\PostgreSQL\18\bin" -DataDir "C:\Program Files\PostgreSQL\18\data" -UsePgCtl

[CmdletBinding()]
param(
  [string]$ServiceName,
  [string]$PgBin = "",
  [string]$DataDir = "",
  [int]$Port = 5432,
  [switch]$UsePgCtl,
  [switch]$SetAutomatic,
  [switch]$Elevated
)

$ErrorActionPreference = "Stop"

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-PgBin {
  param([string]$Requested)
  if ($Requested -and (Test-Path (Join-Path $Requested "pg_isready.exe"))) {
    return (Resolve-Path $Requested).Path
  }
  $candidates = @()
  foreach ($root in @("C:\Program Files\PostgreSQL", "C:\Program Files (x86)\PostgreSQL")) {
    if (Test-Path $root) {
      $candidates += Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { $_.FullName }
    }
  }
  foreach ($candidate in $candidates) {
    $bin = Join-Path $candidate "bin"
    if (Test-Path (Join-Path $bin "pg_isready.exe")) { return $bin }
  }
  $command = Get-Command pg_isready.exe -ErrorAction SilentlyContinue
  if ($command) { return (Split-Path $command.Source -Parent) }
  return $null
}

function Resolve-DataDirFromService {
  param([string]$Name)
  try {
    $service = Get-CimInstance Win32_Service -Filter "Name='$Name'"
    if (-not $service -or -not $service.PathName) { return $null }
    $match = [regex]::Match($service.PathName, '-D\s+(?:"([^"]+)"|(\S+))')
    if (-not $match.Success) { return $null }
    return ($match.Groups[1].Value -or $match.Groups[2].Value)
  } catch {
    return $null
  }
}

function Wait-Ready {
  param([string]$Bin)
  $pgIsReady = Join-Path $Bin "pg_isready.exe"
  if (-not (Test-Path $pgIsReady)) {
    Write-Warning "pg_isready.exe not found in $Bin; cannot verify readiness automatically."
    return $false
  }
  for ($i = 1; $i -le 30; $i++) {
    & $pgIsReady -h 127.0.0.1 -p $Port | Out-Null
    if ($LASTEXITCODE -eq 0) { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

if (-not (Test-Administrator)) {
  Write-Host "Administrator rights are required to start a PostgreSQL Windows service." -ForegroundColor Yellow
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$PSCommandPath`"",
    "-Port", $Port
  )
  if ($ServiceName) { $arguments += @("-ServiceName", $ServiceName) }
  if ($PgBin) { $arguments += @("-PgBin", "`"$PgBin`"") }
  if ($DataDir) { $arguments += @("-DataDir", "`"$DataDir`"") }
  if ($UsePgCtl) { $arguments += "-UsePgCtl" }
  if ($SetAutomatic) { $arguments += "-SetAutomatic" }
  $arguments += "-Elevated"
  Write-Host "Requesting elevation (a UAC prompt will appear)..." -ForegroundColor Yellow
  try {
    $process = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -Verb RunAs -Wait -PassThru
    if ($process.ExitCode -ne 0) {
      throw "The elevated start attempt exited with code $($process.ExitCode)."
    }
    Write-Host "Elevated start completed. Verifying connectivity..." -ForegroundColor Green
    $bin = Resolve-PgBin $PgBin
    if ($bin -and (Wait-Ready $bin)) {
      Write-Host "PostgreSQL is accepting connections on 127.0.0.1:$Port." -ForegroundColor Green
      exit 0
    }
    throw "PostgreSQL was started by the elevated process but is not accepting connections yet."
  } catch {
    Write-Error "Could not elevate/start PostgreSQL. $($_.Exception.Message)"
    exit 1
  }
}

# --- Elevated / already-administrator path --------------------------------

$bin = Resolve-PgBin $PgBin
if (-not $bin) {
  Write-Error "PostgreSQL binaries were not found. Install PostgreSQL or pass -PgBin. This script never initializes a new database."
  exit 1
}

$services = @()
if ($ServiceName) {
  $services = @(Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)
  if ($services.Count -eq 0) {
    Write-Error "Service '$ServiceName' does not exist. Check the exact name with: Get-Service postgresql*"
    exit 1
  }
} else {
  $services = @(Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "postgres" })
}

if ($services.Count -gt 0) {
  foreach ($service in $services) {
    $resolvedDataDir = Resolve-DataDirFromService $service.Name
    if ($resolvedDataDir -and -not (Test-Path $resolvedDataDir)) {
      Write-Error "Service $($service.Name) points at data directory '$resolvedDataDir', which does not exist. Refusing to start: this script will not create or initialize a database."
      exit 1
    }

    # A cluster may already be serving because it was started manually with
    # pg_ctl (the Windows service is then stopped). Starting the service would
    # fail with a port/lock conflict, so detect that before doing anything.
    $standalone = $false
    if ($resolvedDataDir) {
      $pgCtl = Join-Path $bin "pg_ctl.exe"
      & $pgCtl status -D $resolvedDataDir *> $null
      $standalone = ($LASTEXITCODE -eq 0)
    }

    if ($service.Status -eq "Running") {
      Write-Host "Service $($service.Name) is already running." -ForegroundColor Green
    } elseif ($standalone) {
      Write-Host "The existing cluster is already running outside the Windows service (started with pg_ctl)." -ForegroundColor Green
      Write-Host "No second instance was started. Stop the standalone instance before starting the service." -ForegroundColor Yellow
    } else {
      Write-Host "Starting service $($service.Name)..." -ForegroundColor Yellow
      try {
        Start-Service -Name $service.Name -ErrorAction Stop
      } catch {
        Write-Error @"
Could not start service $($service.Name): $($_.Exception.Message)

Diagnostics (read-only):
  sc.exe qc $($service.Name)
  sc.exe queryex $($service.Name)
  Get-EventLog -LogName Application -Source 'PostgreSQL' -Newest 20

The service configuration and data directory were NOT modified. Inspect the
service account (it must be able to read/write the data directory and the log
file) and the PostgreSQL log under the data directory's 'log' folder.
"@
        exit 1
      }
    }

    # Make the verified service start after a reboot. This changes only the start
    # mode (demand -> automatic); it does not touch the binary path, account,
    # port or data directory, all of which were checked above.
    if ($SetAutomatic) {
      $serviceConfig = Get-CimInstance Win32_Service -Filter "Name='$($service.Name)'"
      if ($serviceConfig.StartMode -ne "Auto") {
        Write-Host "Setting $($service.Name) to start automatically (verified data directory: $resolvedDataDir)..." -ForegroundColor Yellow
        & sc.exe config $service.Name start= auto | Out-Null
        if ($LASTEXITCODE -ne 0) {
          Write-Error "Could not set the service start mode. No other service setting was changed."
          exit 1
        }
      } else {
        Write-Host "Service $($service.Name) is already set to start automatically." -ForegroundColor Green
      }
    }
  }
} elseif ($UsePgCtl) {
  if (-not $DataDir) {
    Write-Error "-UsePgCtl requires -DataDir pointing at the existing cluster. This script never calls initdb."
    exit 1
  }
  if (-not (Test-Path (Join-Path $DataDir "PG_VERSION"))) {
    Write-Error "'$DataDir' does not look like an existing PostgreSQL data directory (PG_VERSION missing). Refusing to start or initialize it."
    exit 1
  }
  $env:PATH = "$bin;$env:PATH"
  $log = Join-Path $DataDir "log\startup-pgctl.log"
  New-Item -ItemType Directory -Force -Path (Split-Path $log -Parent) | Out-Null
  Write-Host "Starting the existing cluster with pg_ctl (no configuration changes)..." -ForegroundColor Yellow
  & (Join-Path $bin "pg_ctl.exe") start -D $DataDir -l $log -w -t 60
  if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_ctl failed (exit $LASTEXITCODE). See $log. Nothing was initialized, deleted or reconfigured."
    exit 1
  }
} else {
  Write-Error "No PostgreSQL Windows service was found. Re-run with -UsePgCtl -DataDir '<existing data dir>' if the cluster exists but has no service. This script never creates a database."
  exit 1
}

if (-not (Wait-Ready $bin)) {
  Write-Error "PostgreSQL did not become ready on 127.0.0.1:$Port. Check the PostgreSQL log. No configuration, port or data was changed by this script."
  exit 1
}

Write-Host "PostgreSQL is accepting connections on 127.0.0.1:$Port." -ForegroundColor Green
Write-Host "Existing databases were not initialized, deleted or migrated by this script." -ForegroundColor Gray
exit 0
