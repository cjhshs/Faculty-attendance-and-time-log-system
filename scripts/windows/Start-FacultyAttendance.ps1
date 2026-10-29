[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $env:ProgramData "FacultyAttendance\app.env")
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

$root = Get-FacultyInstallRoot
$appRoot = Join-Path $root "app"
$configPath = Get-FacultyConfigPath -Path $ConfigPath
$dataRoot = Split-Path -Parent $configPath
$logDir = Join-Path $dataRoot "logs"
$stopFlag = Join-Path $dataRoot "stop.flag"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

try {
    $config = Read-FacultyEnvFile -Path $configPath
    $required = @("DATABASE_URL", "SESSION_SECRET", "PORT", "BIND_ADDRESS")
    foreach ($key in $required) {
        if (-not $config.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($config[$key])) {
            throw "Missing required configuration value: $key"
        }
    }

    $env:DATABASE_URL = $config["DATABASE_URL"]
    $env:SESSION_SECRET = $config["SESSION_SECRET"]
    $env:NODE_ENV = "production"
    $env:NEXT_TELEMETRY_DISABLED = "1"
    if ($config.ContainsKey("SESSION_COOKIE_SECURE")) {
        $env:SESSION_COOKIE_SECURE = $config["SESSION_COOKIE_SECURE"]
    }
    if ($config.ContainsKey("BACKUP_DIR")) { $env:BACKUP_DIR = $config["BACKUP_DIR"] }
    if ($config.ContainsKey("PG_DUMP_PATH")) { $env:PG_DUMP_PATH = $config["PG_DUMP_PATH"] }
    if ($config.ContainsKey("PG_RESTORE_PATH")) { $env:PG_RESTORE_PATH = $config["PG_RESTORE_PATH"] }

    $port = [int]$config["PORT"]
    if ($port -lt 1 -or $port -gt 65535) { throw "Invalid PORT value." }
    $bindAddress = $config["BIND_ADDRESS"]
    $node = Get-FacultyNodePath
    $nextCli = Join-Path $appRoot "node_modules\next\dist\bin\next"
    if (-not (Test-Path -LiteralPath $nextCli -PathType Leaf)) {
        throw "Next.js runtime was not found at $nextCli."
    }

    if (Test-Path -LiteralPath $stopFlag) { Remove-Item -LiteralPath $stopFlag -Force }

    Write-FacultyLog -Message "Starting Faculty Attendance on $bindAddress`:$port" -LogPath (Join-Path $logDir "startup.log")

    while (-not (Test-Path -LiteralPath $stopFlag)) {
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $stdout = Join-Path $logDir "app-$stamp.out.log"
        $stderr = Join-Path $logDir "app-$stamp.err.log"
        $arguments = '"{0}" start -H {1} -p {2}' -f $nextCli, $bindAddress, $port

        $process = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $appRoot -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -WindowStyle Hidden
        Write-FacultyLog -Message "Process started (PID $($process.Id))." -LogPath (Join-Path $logDir "startup.log")
        Wait-Process -Id $process.Id
        $exitCode = $process.ExitCode
        Write-FacultyLog -Message "Process $($process.Id) exited with code $exitCode." -LogPath (Join-Path $logDir "startup.log")
        if (-not (Test-Path -LiteralPath $stopFlag)) { Start-Sleep -Seconds 10 }
    }
}
catch {
    Write-FacultyLog -Message ("Startup failed: " + $_.Exception.Message) -LogPath (Join-Path $logDir "startup.log")
    throw
}
