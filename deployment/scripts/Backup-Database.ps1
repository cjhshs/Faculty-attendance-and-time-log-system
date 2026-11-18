[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $env:ProgramData "FacultyAttendance\app.env"),
    [string]$OutputDirectory,
    [int]$RetentionDays = 30,
    [string]$Prefix = "faculty-attendance"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

$resolvedConfigPath = Get-FacultyConfigPath -Path $ConfigPath
$logPath = Join-Path (Split-Path -Parent $resolvedConfigPath) "logs\backup.log"
try {
    $config = Read-FacultyEnvFile -Path $resolvedConfigPath
    if (-not $config.ContainsKey("DATABASE_URL")) { throw "DATABASE_URL is missing from the app configuration." }
    $databaseUrl = $config["DATABASE_URL"]
    $uri = [Uri]$databaseUrl
    $database = $uri.AbsolutePath.TrimStart("/")
    if ([string]::IsNullOrWhiteSpace($database)) { throw "DATABASE_URL does not contain a database name." }

    if (-not $OutputDirectory) {
        $OutputDirectory = if ($config.ContainsKey("BACKUP_DIR")) { $config["BACKUP_DIR"] } else { Join-Path $env:ProgramData "FacultyAttendance\backups" }
    }
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

    $pgDump = Resolve-FacultyPostgresTool -Name "pg_dump" -ConfiguredPath $(if ($config.ContainsKey("PG_DUMP_PATH")) { $config["PG_DUMP_PATH"] }) -PostgresBin $(if ($config.ContainsKey("PG_BIN")) { $config["PG_BIN"] })
    $port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    $user = [Uri]::UnescapeDataString($uri.UserInfo.Split(":", 2)[0])
    $password = if ($uri.UserInfo.Contains(":")) { [Uri]::UnescapeDataString($uri.UserInfo.Split(":", 2)[1]) } else { "" }
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $file = Join-Path $OutputDirectory "$Prefix-$database-$stamp.dump"

    $env:PGPASSWORD = $password
    $env:PGCONNECT_TIMEOUT = "15"
    Write-FacultyLog -Message "Backing up $database to $file" -LogPath $logPath
    & $pgDump -Fc --no-owner --no-privileges -h $uri.Host -p $port -U $user -d $database -f $file
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $file) -or (Get-Item -LiteralPath $file).Length -eq 0) {
        throw "pg_dump failed; no valid backup was created."
    }

    $env:PGPASSWORD = $null
    Write-FacultyLog -Message ("Backup completed: {0} ({1:N0} bytes)" -f $file, (Get-Item -LiteralPath $file).Length) -LogPath $logPath

    if ($RetentionDays -gt 0) {
        $cutoff = (Get-Date).AddDays(-$RetentionDays)
        Get-ChildItem -LiteralPath $OutputDirectory -Filter "$Prefix-*.dump" -File |
            Where-Object { $_.LastWriteTime -lt $cutoff } |
            ForEach-Object {
                Remove-Item -LiteralPath $_.FullName -Force
                Write-FacultyLog -Message "Removed expired backup $($_.Name)" -LogPath $logPath
            }
    }
}
catch {
    $env:PGPASSWORD = $null
    Write-FacultyLog -Message ("Backup failed: " + $_.Exception.Message) -LogPath $logPath
    throw
}
