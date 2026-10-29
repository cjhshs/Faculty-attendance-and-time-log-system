[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ConfigFile,
    [switch]$SkipStart
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Common.ps1")

$root = Get-FacultyInstallRoot
$appRoot = Join-Path $root "app"
$dataRoot = Join-Path $env:ProgramData "FacultyAttendance"
$logDir = Join-Path $dataRoot "logs"
$backupDir = Join-Path $dataRoot "backups"
$appConfigPath = Join-Path $dataRoot "app.env"
$setupLog = Join-Path $logDir "setup.log"
$taskName = "FacultyAttendance"
$backupTaskName = "FacultyAttendanceBackup"
$firewallRuleName = "Faculty Attendance Web"

New-Item -ItemType Directory -Force -Path $logDir, $backupDir | Out-Null

function Invoke-Psql {
    param(
        [Parameter(Mandatory = $true)][string]$Psql,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )
    $output = & $Psql @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "psql failed: $($output | Out-String)"
    }
    return $output
}

function New-SessionSecret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes)
}

function Write-EnvFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][System.Collections.IDictionary]$Values
    )
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("# Faculty Attendance runtime configuration. Keep this file private.")
    foreach ($key in $Values.Keys) {
        $lines.Add("$key=$($Values[$key])")
    }
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($Path, $lines, $encoding)
    Protect-FacultySecretFile -Path $Path
}

try {
    if (-not (Test-FacultyAdministrator)) { throw "Setup must run as Administrator." }
    if (-not (Test-Path -LiteralPath $ConfigFile)) { throw "Setup configuration not found: $ConfigFile" }

    $json = Get-Content -LiteralPath $ConfigFile -Raw | ConvertFrom-Json
    $dbHost = [string]$json.DbHost
    $dbPort = if ($json.DbPort) { [int]$json.DbPort } else { 5432 }
    $dbName = [string]$json.DbName
    $dbUser = [string]$json.DbUser
    $dbPassword = [string]$json.DbPassword
    $appPort = if ($json.AppPort) { [int]$json.AppPort } else { 3000 }
    $postgresBin = [string]$json.PostgresBin
    $allowLan = [bool]$json.AllowLan
    $useHttps = [bool]$json.UseHttps
    $createDatabase = [bool]$json.CreateDatabase
    $initialize = [bool]$json.Initialize
    $adminUser = [string]$json.AdminUser
    $adminPassword = [string]$json.AdminPassword
    $desktopShortcut = [bool]$json.DesktopShortcut

    if ([string]::IsNullOrWhiteSpace($dbHost)) { throw "Database host is required." }
    if ($dbPort -lt 1 -or $dbPort -gt 65535) { throw "Invalid database port." }
    if ($dbName -notmatch "^[A-Za-z_][A-Za-z0-9_]*$") { throw "Database name must contain only letters, numbers, and underscores." }
    if ([string]::IsNullOrWhiteSpace($dbUser)) { throw "Database user is required." }
    if ($appPort -lt 1 -or $appPort -gt 65535) { throw "Invalid application port." }
    if ($initialize -and ([string]::IsNullOrWhiteSpace($adminUser) -or [string]::IsNullOrWhiteSpace($adminPassword))) {
        throw "Initial administrator username and password are required when initializing a new database."
    }

    Ensure-FacultyPostgresService -DbHost $dbHost -DbPort $dbPort -LogPath $setupLog

    $psql = Resolve-FacultyPostgresTool -Name "psql" -ConfiguredPath ([string]$json.PsqlPath) -PostgresBin $postgresBin
    $pgDump = Resolve-FacultyPostgresTool -Name "pg_dump" -ConfiguredPath ([string]$json.PgDumpPath) -PostgresBin $postgresBin
    $pgRestore = Resolve-FacultyPostgresTool -Name "pg_restore" -ConfiguredPath ([string]$json.PgRestorePath) -PostgresBin $postgresBin

    $env:PGPASSWORD = $dbPassword
    $env:PGCONNECT_TIMEOUT = "15"
    Write-FacultyLog -Message "Checking database $dbHost`:$dbPort/$dbName" -LogPath $setupLog

    $databaseExists = $false
    $existsOutput = Invoke-Psql -Psql $psql -Arguments @("-h", $dbHost, "-p", $dbPort, "-U", $dbUser, "-d", "postgres", "-tAc", "SELECT 1 FROM pg_database WHERE datname = '$dbName';")
    $databaseExists = (($existsOutput | Out-String).Trim() -eq "1")

    if (-not $databaseExists) {
        if (-not $createDatabase) {
            throw "Database '$dbName' does not exist. Select 'Create database' during setup or create it manually."
        }
        Write-FacultyLog -Message "Creating database $dbName" -LogPath $setupLog
        Invoke-Psql -Psql $psql -Arguments @("-h", $dbHost, "-p", $dbPort, "-U", $dbUser, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "CREATE DATABASE `"$dbName`";") | Out-Null
    }

    Invoke-Psql -Psql $psql -Arguments @("-h", $dbHost, "-p", $dbPort, "-U", $dbUser, "-d", $dbName, "-tAc", "SELECT 1;") | Out-Null

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = Join-Path $backupDir "preinstall-$dbName-$stamp.dump"
    Write-FacultyLog -Message "Backing up database to $backupPath" -LogPath $setupLog
    & $pgDump -Fc --no-owner --no-privileges -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $backupPath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backupPath) -or (Get-Item -LiteralPath $backupPath).Length -eq 0) {
        throw "Database backup failed. Migration was not attempted."
    }

    $encodedUser = [Uri]::EscapeDataString($dbUser)
    $encodedPassword = [Uri]::EscapeDataString($dbPassword)
    $databaseUrl = "postgresql://$encodedUser`:$encodedPassword@$dbHost`:$dbPort/$dbName?schema=public"
    $env:DATABASE_URL = $databaseUrl

    $node = Get-FacultyNodePath
    $prismaCli = Join-Path $appRoot "node_modules\prisma\build\index.js"
    if (-not (Test-Path -LiteralPath $prismaCli -PathType Leaf)) { throw "Prisma CLI not found in the application package." }

    Write-FacultyLog -Message "Applying pending Prisma migrations" -LogPath $setupLog
    & $node $prismaCli migrate deploy --schema (Join-Path $appRoot "prisma\schema.prisma")
    if ($LASTEXITCODE -ne 0) { throw "Prisma migrate deploy failed. Restore the pre-install backup if needed." }

    $userCountOutput = Invoke-Psql -Psql $psql -Arguments @("-h", $dbHost, "-p", $dbPort, "-U", $dbUser, "-d", $dbName, "-tAc", "SELECT CASE WHEN to_regclass('public.users') IS NULL THEN 0 ELSE (SELECT count(*) FROM users) END;")
    $userCount = [int](($userCountOutput | Out-String).Trim())

    if ($initialize) {
        if ($userCount -gt 0) {
            Write-FacultyLog -Message "Initialization requested but users already exist; seeding was skipped." -LogPath $setupLog
        }
        else {
            $tsxCli = Join-Path $appRoot "node_modules\tsx\dist\cli.mjs"
            if (-not (Test-Path -LiteralPath $tsxCli -PathType Leaf)) { throw "tsx CLI not found; cannot initialize reference data." }
            $env:SEED_DEAN_USERNAME = $adminUser
            $env:SEED_DEAN_PASSWORD = $adminPassword
            Write-FacultyLog -Message "Initializing reference data and first administrator" -LogPath $setupLog
            & $node $tsxCli (Join-Path $appRoot "prisma\seed.ts")
            if ($LASTEXITCODE -ne 0) { throw "Database initialization failed. Migrations and the pre-install backup remain available." }
            Remove-Item Env:SEED_DEAN_USERNAME, Env:SEED_DEAN_PASSWORD -ErrorAction SilentlyContinue
        }
    }
    elseif ($userCount -eq 0) {
        Write-FacultyLog -Message "Database has no users. Run setup with explicit initialization before first login." -LogPath $setupLog
    }

    $bindAddress = if ($allowLan) { "0.0.0.0" } else { "127.0.0.1" }
    $values = [ordered]@{
        DATABASE_URL = $databaseUrl
        SESSION_SECRET = New-SessionSecret
        SESSION_COOKIE_SECURE = if ($useHttps) { "true" } else { "false" }
        PORT = [string]$appPort
        BIND_ADDRESS = $bindAddress
        BACKUP_DIR = $backupDir
        PG_DUMP_PATH = $pgDump
        PG_RESTORE_PATH = $pgRestore
        PG_BIN = (Split-Path -Parent $psql)
    }
    Write-EnvFile -Path $appConfigPath -Values $values
    Write-FacultyLog -Message "Runtime configuration written to $appConfigPath" -LogPath $setupLog

    $startScript = Join-Path $root "scripts\windows\Start-FacultyAttendance.ps1"
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

    $backupScript = Join-Path $root "scripts\windows\Backup-Database.ps1"
    $backupArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`""
    $backupAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $backupArguments
    $backupTrigger = New-ScheduledTaskTrigger -Daily -At "02:00"
    Register-ScheduledTask -TaskName $backupTaskName -Action $backupAction -Trigger $backupTrigger -Principal $principal -Settings $settings -Force | Out-Null

    $existingRule = Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue
    if ($existingRule) { Remove-NetFirewallRule -DisplayName $firewallRuleName }
    if ($allowLan) {
        New-NetFirewallRule -DisplayName $firewallRuleName -Description "Faculty Attendance web access from the private LAN" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $appPort -Profile Private -RemoteAddress LocalSubnet | Out-Null
        Write-FacultyLog -Message "Firewall rule allows TCP $appPort only from LocalSubnet on the Private profile." -LogPath $setupLog
    }
    else {
        Write-FacultyLog -Message "LAN access disabled; application will bind to localhost only." -LogPath $setupLog
    }

    if ($desktopShortcut) {
        $desktop = [Environment]::GetFolderPath("CommonDesktopDirectory")
        if ($desktop) {
            $shortcutPath = Join-Path $desktop "Faculty Attendance.url"
            $url = "http://localhost:$appPort/"
            $content = "[InternetShortcut]`r`nURL=$url`r`n"
            [System.IO.File]::WriteAllText($shortcutPath, $content)
        }
    }

    if (-not $SkipStart) {
        Write-FacultyLog -Message "Starting the application task" -LogPath $setupLog
        Start-ScheduledTask -TaskName $taskName
        $ready = $false
        for ($i = 0; $i -lt 60; $i++) {
            Start-Sleep -Seconds 2
            try {
                $response = Invoke-WebRequest -Uri "http://127.0.0.1:$appPort/login" -UseBasicParsing -TimeoutSec 5
                if ($response.StatusCode -eq 200) { $ready = $true; break }
            }
            catch { }
        }
        if (-not $ready) {
            $latest = Get-ChildItem -LiteralPath $logDir -Filter "app-*.err.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            $detail = if ($latest) { (Get-Content -LiteralPath $latest.FullName -Tail 20 | Out-String) } else { "No application error log was produced." }
            throw "Application did not become ready on port $appPort. $detail"
        }
        Write-FacultyLog -Message "Application is ready on port $appPort" -LogPath $setupLog
    }

    $env:PGPASSWORD = $null
    Write-FacultyLog -Message "Setup completed successfully" -LogPath $setupLog
}
catch {
    $env:PGPASSWORD = $null
    Remove-Item Env:SEED_DEAN_USERNAME, Env:SEED_DEAN_PASSWORD -ErrorAction SilentlyContinue
    Write-FacultyLog -Message ("Setup failed: " + $_.Exception.Message) -LogPath $setupLog
    throw
}
finally {
    Remove-Item -LiteralPath $ConfigFile -Force -ErrorAction SilentlyContinue
}
