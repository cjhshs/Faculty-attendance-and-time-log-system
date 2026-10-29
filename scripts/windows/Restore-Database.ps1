[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$BackupFile,
    [Parameter(Mandatory = $true)][string]$TargetDatabase,
    [string]$ConfigPath = (Join-Path $env:ProgramData "FacultyAttendance\app.env"),
    [switch]$SwitchConfig
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

$resolvedConfigPath = Get-FacultyConfigPath -Path $ConfigPath
$logPath = Join-Path (Split-Path -Parent $resolvedConfigPath) "logs\restore.log"
$taskName = "FacultyAttendance"
try {
    if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) { throw "Backup file not found: $BackupFile" }
    if ($TargetDatabase -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") { throw "Target database name is invalid." }
    $config = Read-FacultyEnvFile -Path $resolvedConfigPath
    if (-not $config.ContainsKey("DATABASE_URL")) { throw "DATABASE_URL is missing from the app configuration." }

    $uri = [Uri]$config["DATABASE_URL"]
    $hostName = $uri.Host
    $port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    $user = [Uri]::UnescapeDataString($uri.UserInfo.Split(":", 2)[0])
    $password = if ($uri.UserInfo.Contains(":")) { [Uri]::UnescapeDataString($uri.UserInfo.Split(":", 2)[1]) } else { "" }
    $psql = Resolve-FacultyPostgresTool -Name "psql" -ConfiguredPath $(if ($config.ContainsKey("PG_BIN")) { Join-Path $config["PG_BIN"] "psql.exe" }) -PostgresBin $(if ($config.ContainsKey("PG_BIN")) { $config["PG_BIN"] })
    $pgRestore = Resolve-FacultyPostgresTool -Name "pg_restore" -ConfiguredPath $(if ($config.ContainsKey("PG_RESTORE_PATH")) { $config["PG_RESTORE_PATH"] }) -PostgresBin $(if ($config.ContainsKey("PG_BIN")) { $config["PG_BIN"] })

    $env:PGPASSWORD = $password
    $env:PGCONNECT_TIMEOUT = "15"

    $listing = & $pgRestore -l $BackupFile 2>&1
    if ($LASTEXITCODE -ne 0) { throw "The backup file could not be read by pg_restore." }

    $exists = (& $psql -h $hostName -p $port -U $user -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$TargetDatabase';" | Out-String).Trim()
    if ($exists -ne "1") {
        Write-FacultyLog -Message "Creating restore target database $TargetDatabase" -LogPath $logPath
        & $psql -h $hostName -p $port -U $user -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE `"$TargetDatabase`";"
        if ($LASTEXITCODE -ne 0) { throw "Could not create restore target database." }
    }
    else {
        $tableCount = (& $psql -h $hostName -p $port -U $user -d $TargetDatabase -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" | Out-String).Trim()
        if ([int]$tableCount -gt 0) {
            throw "Target database '$TargetDatabase' already contains tables. Restore into a new empty database instead."
        }
    }

    Write-FacultyLog -Message "Restoring $BackupFile into $TargetDatabase" -LogPath $logPath
    & $pgRestore -h $hostName -p $port -U $user -d $TargetDatabase --no-owner --no-privileges --exit-on-error $BackupFile
    if ($LASTEXITCODE -ne 0) { throw "pg_restore failed. The target database may be incomplete; do not switch to it." }

    $migrationCount = (& $psql -h $hostName -p $port -U $user -d $TargetDatabase -tAc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;" | Out-String).Trim()
    $slotCount = (& $psql -h $hostName -p $port -U $user -d $TargetDatabase -tAc "SELECT count(*) FROM schedule_slots;" | Out-String).Trim()
    Write-FacultyLog -Message "Restore verification: migrations=$migrationCount schedule_slots=$slotCount" -LogPath $logPath

    if ($SwitchConfig) {
        if (-not (Test-FacultyAdministrator)) { throw "Switching the live configuration requires Administrator." }
        $backupConfig = "$ConfigPath.before-restore-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Copy-Item -LiteralPath $ConfigPath -Destination $backupConfig -Force
        Protect-FacultySecretFile -Path $backupConfig

        $encodedUser = [Uri]::EscapeDataString($user)
        $encodedPassword = [Uri]::EscapeDataString($password)
        $newUrl = "postgresql://$encodedUser`:$encodedPassword@$hostName`:$port/$TargetDatabase?schema=public"
        $lines = Get-Content -LiteralPath $ConfigPath | ForEach-Object {
            if ($_ -match "^DATABASE_URL=") { "DATABASE_URL=$newUrl" } else { $_ }
        }
        $encoding = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllLines($ConfigPath, $lines, $encoding)
        Protect-FacultySecretFile -Path $ConfigPath

        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($task) { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 3
        if ($task) { Start-ScheduledTask -TaskName $taskName }
        Write-FacultyLog -Message "Live configuration now points to $TargetDatabase; previous configuration saved as $backupConfig" -LogPath $logPath
    }
    else {
        Write-FacultyLog -Message "Restore complete. The live configuration was not changed." -LogPath $logPath
    }

    $env:PGPASSWORD = $null
}
catch {
    $env:PGPASSWORD = $null
    Write-FacultyLog -Message ("Restore failed: " + $_.Exception.Message) -LogPath $logPath
    throw
}
