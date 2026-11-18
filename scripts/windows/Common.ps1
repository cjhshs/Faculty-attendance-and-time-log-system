$ErrorActionPreference = "Stop"

function Get-FacultyInstallRoot {
    return (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
}

function Get-FacultyConfigPath {
    param([string]$Path)
    if ($Path) { return [System.IO.Path]::GetFullPath($Path) }
    return (Join-Path $env:ProgramData "FacultyAttendance\app.env")
}

function Read-FacultyEnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Configuration file not found: $Path"
    }

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) { continue }
        $index = $trimmed.IndexOf("=")
        if ($index -lt 1) { continue }
        $key = $trimmed.Substring(0, $index).Trim()
        $value = $trimmed.Substring($index + 1).Trim()
        if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$key] = $value
    }
    return $values
}

function Resolve-FacultyPostgresTool {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$ConfiguredPath,
        [string]$PostgresBin
    )

    if ($ConfiguredPath -and (Test-Path -LiteralPath $ConfiguredPath -PathType Leaf)) {
        return $ConfiguredPath
    }
    if ($PostgresBin) {
        $candidate = Join-Path $PostgresBin ($Name + ".exe")
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }

    $command = Get-Command ($Name + ".exe") -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    foreach ($version in @("18", "17", "16", "15", "14")) {
        $candidate = Join-Path $env:ProgramFiles "PostgreSQL\$version\bin\$Name.exe"
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }

    throw "Could not find $Name.exe. Install PostgreSQL client tools or set PG_BIN in the app configuration."
}

function Write-FacultyLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [string]$LogPath
    )
    $line = "{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $Message
    if ($LogPath) {
        $parent = Split-Path -Parent $LogPath
        if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
        Add-Content -LiteralPath $LogPath -Value $line
    }
    Write-Output $line
}

function Test-FacultyAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Protect-FacultySecretFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    $system = "*S-1-5-18:(F)"
    $administrators = "*S-1-5-32-544:(F)"
    & icacls.exe $Path /inheritance:r /grant:r $system $administrators | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not restrict permissions on $Path."
    }
}

function Test-FacultyLocalHost {
    param([Parameter(Mandatory = $true)][string]$HostName)
    return $HostName -in @("localhost", "127.0.0.1", "::1", ".")
}

function Ensure-FacultyPostgresService {
    param(
        [Parameter(Mandatory = $true)][string]$DbHost,
        [Parameter(Mandatory = $true)][int]$DbPort,
        [string]$LogPath
    )

    if (-not (Test-FacultyLocalHost -HostName $DbHost)) {
        Write-FacultyLog -Message "Database host is remote ($DbHost); PostgreSQL service checks are skipped." -LogPath $LogPath
        return
    }

    $services = @(Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue)
    if ($services.Count -eq 0) {
        throw "No PostgreSQL Windows service was found. Install PostgreSQL with a Windows service, or configure a managed client installation first."
    }

    $running = @($services | Where-Object { $_.Status -eq "Running" })
    if ($running.Count -gt 0) {
        Write-FacultyLog -Message "PostgreSQL service is running: $($running[0].Name)" -LogPath $LogPath
        return
    }

    if ($services.Count -gt 1) {
        $names = ($services | ForEach-Object { "$($_.Name) [$($_.StartType)]" }) -join ", "
        throw "Multiple PostgreSQL services are installed and none is running: $names. Start the correct service before installing."
    }

    $service = $services[0]
    $portInUse = Test-NetConnection -ComputerName "127.0.0.1" -Port $DbPort -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($portInUse) {
        throw "PostgreSQL is listening on port $DbPort, but service '$($service.Name)' is $($service.Status)/$($service.StartType). Stop the manually started PostgreSQL server, then run setup again so the Windows service can own the database."
    }

    if ($service.StartType -eq "Disabled") {
        Write-FacultyLog -Message "Enabling PostgreSQL service $($service.Name) for automatic startup." -LogPath $LogPath
        Set-Service -Name $service.Name -StartupType Automatic
    }

    Write-FacultyLog -Message "Starting PostgreSQL service $($service.Name)." -LogPath $LogPath
    Start-Service -Name $service.Name
    $deadline = (Get-Date).AddSeconds(60)
    do {
        Start-Sleep -Seconds 2
        $service.Refresh()
    } while ($service.Status -ne "Running" -and (Get-Date) -lt $deadline)

    if ($service.Status -ne "Running") {
        throw "PostgreSQL service '$($service.Name)' did not reach the Running state."
    }
    Write-FacultyLog -Message "PostgreSQL service is running: $($service.Name)" -LogPath $LogPath
}

function Get-FacultyNodePath {
    $root = Get-FacultyInstallRoot
    $bundled = Join-Path $root "runtime\node.exe"
    if (Test-Path -LiteralPath $bundled -PathType Leaf) { return $bundled }
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    throw "Node.js was not found. Reinstall the application with its bundled runtime or install Node.js 22/24 LTS."
}

function Get-FacultyLocalIPv4Addresses {
    try {
        $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
            Select-Object -ExpandProperty IPAddress
        return @($ips)
    }
    catch {
        return @()
    }
}

function Get-FacultyServiceStatus {
    param(
        [string]$ConfigPath = (Join-Path $env:ProgramData "FacultyAttendance\app.env"),
        [string]$TaskName = "FacultyAttendance"
    )

    $result = [ordered]@{
        Installed = $false
        Running = $false
        TaskState = "NotFound"
        Port = 3000
        BindAddress = "0.0.0.0"
        ProcessId = $null
        LocalUrl = "http://localhost:3000/"
        LanUrls = @()
        Database = ""
    }

    $resolvedConfig = Get-FacultyConfigPath -Path $ConfigPath
    if (Test-Path -LiteralPath $resolvedConfig) {
        $result.Installed = $true
        try {
            $config = Read-FacultyEnvFile -Path $resolvedConfig
            if ($config.ContainsKey("PORT")) { $result.Port = [int]$config["PORT"] }
            if ($config.ContainsKey("BIND_ADDRESS")) { $result.BindAddress = $config["BIND_ADDRESS"] }
            if ($config.ContainsKey("DATABASE_URL")) {
                try {
                    $u = [Uri]$config["DATABASE_URL"]
                    $result.Database = "$($u.Host):$($u.Port)$($u.AbsolutePath)"
                } catch { }
            }
        } catch { }
    }

    $result.LocalUrl = "http://localhost:$($result.Port)/"
    $lanIps = Get-FacultyLocalIPv4Addresses
    $result.LanUrls = @($lanIps | ForEach-Object { "http://$($_):$($result.Port)/" })

    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        $result.TaskState = [string]$task.State
    }

    # Check whether port is listening and find PID
    $portConnections = Get-NetTCPConnection -LocalPort $result.Port -State Listen -ErrorAction SilentlyContinue
    if ($portConnections) {
        $result.Running = $true
        $result.ProcessId = ($portConnections | Select-Object -First 1).OwningProcess
    } elseif ($task -and $task.State -eq "Running") {
        # Task is running but port not yet bound (starting up)
        $result.Running = $true
    }

    return [PSCustomObject]$result
}

function Test-FacultyProcessBelongsToApp {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [string]$AppRoot
    )
    if ($ProcessId -le 4) { return $false }
    try {
        $procInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
        if (-not $procInfo) { return $false }

        $cmd = [string]$procInfo.CommandLine
        $exe = [string]$procInfo.ExecutablePath

        $installRoot = Get-FacultyInstallRoot
        $bundledNode = Join-Path $installRoot "runtime\node.exe"
        if ($exe) {
            if ($exe -eq $bundledNode) { return $true }
            if (Test-Path -LiteralPath $bundledNode -PathType Leaf) {
                $exeItem = Get-Item $exe -ErrorAction SilentlyContinue
                $bundledItem = Get-Item $bundledNode -ErrorAction SilentlyContinue
                if ($exeItem -and $bundledItem -and $exeItem.FullName -eq $bundledItem.FullName) {
                    return $true
                }
            }
        }

        if ($AppRoot -and $cmd -match [regex]::Escape($AppRoot)) {
            return $true
        }
        if ($installRoot -and $cmd -match [regex]::Escape($installRoot)) {
            return $true
        }

        if ($cmd -match "FacultyAttendance" -or $cmd -match "Start-FacultyAttendance" -or $cmd -match "node_modules\\next\\dist\\bin\\next") {
            return $true
        }

        return $false
    }
    catch {
        return $false
    }
}

function Stop-FacultyService {
    param(
        [string]$ConfigPath = (Join-Path $env:ProgramData "FacultyAttendance\app.env"),
        [string]$TaskName = "FacultyAttendance",
        [int]$WaitPortTimeoutSeconds = 15
    )

    $resolvedConfig = Get-FacultyConfigPath -Path $ConfigPath
    $dataRoot = Split-Path -Parent $resolvedConfig
    $stopFlag = Join-Path $dataRoot "stop.flag"
    $appRoot = Join-Path (Get-FacultyInstallRoot) "app"

    # Step 1: Set stop flag to instruct Start-FacultyAttendance loop to terminate
    if (Test-Path -LiteralPath $dataRoot) {
        New-Item -ItemType File -Force -Path $stopFlag | Out-Null
    }

    # Step 2: Stop scheduled task if present
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    }

    # Step 3: Determine application port from actual configuration
    $port = 3000
    if (Test-Path -LiteralPath $resolvedConfig) {
        try {
            $config = Read-FacultyEnvFile -Path $resolvedConfig
            if ($config.ContainsKey("PORT")) { $port = [int]$config["PORT"] }
        } catch { }
    }

    # Step 4: Terminate any verified node.exe listening on that port
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        $pidToStop = $conn.OwningProcess
        if ($pidToStop -and $pidToStop -gt 4) {
            if (Test-FacultyProcessBelongsToApp -ProcessId $pidToStop -AppRoot $appRoot) {
                Write-FacultyLog -Message "Terminating verified application process PID $pidToStop on port $port" -LogPath (Join-Path $dataRoot "logs\startup.log")
                Stop-Process -Id $pidToStop -Force -ErrorAction SilentlyContinue
            } else {
                Write-Warning "Port $port is held by process PID $pidToStop, which does not appear to belong to Faculty Attendance. Leaving it untouched."
            }
        }
    }

    # Step 5: Terminate any orphaned PowerShell wrapper running Start-FacultyAttendance.ps1
    $orphanedWrappers = Get-CimInstance Win32_Process -Filter "Name LIKE '%powershell%'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match "Start-FacultyAttendance" }
    foreach ($wrapper in $orphanedWrappers) {
        if ($wrapper.ProcessId -ne $PID -and (Test-FacultyProcessBelongsToApp -ProcessId $wrapper.ProcessId -AppRoot $appRoot)) {
            Stop-Process -Id $wrapper.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }

    # Step 6: Verify application port is completely released
    $deadline = (Get-Date).AddSeconds($WaitPortTimeoutSeconds)
    do {
        Start-Sleep -Milliseconds 500
        $remaining = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    } while ($remaining -and (Get-Date) -lt $deadline)

    if ($remaining) {
        $remainingPid = ($remaining | Select-Object -First 1).OwningProcess
        if (Test-FacultyProcessBelongsToApp -ProcessId $remainingPid -AppRoot $appRoot) {
            Stop-Process -Id $remainingPid -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
    }

    if (Test-Path -LiteralPath $stopFlag) {
        Remove-Item -LiteralPath $stopFlag -Force -ErrorAction SilentlyContinue
    }
}

function Start-FacultyServiceInstance {
    param(
        [string]$ConfigPath = (Join-Path $env:ProgramData "FacultyAttendance\app.env"),
        [string]$TaskName = "FacultyAttendance",
        [int]$TimeoutSeconds = 45
    )

    $resolvedConfig = Get-FacultyConfigPath -Path $ConfigPath
    $dataRoot = Split-Path -Parent $resolvedConfig
    $stopFlag = Join-Path $dataRoot "stop.flag"
    if (Test-Path -LiteralPath $stopFlag) {
        Remove-Item -LiteralPath $stopFlag -Force -ErrorAction SilentlyContinue
    }

    $config = Read-FacultyEnvFile -Path $resolvedConfig
    $port = if ($config.ContainsKey("PORT")) { [int]$config["PORT"] } else { 3000 }

    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($task) {
        Start-ScheduledTask -TaskName $TaskName
    } else {
        # Fallback if task is not installed: start hidden background process directly
        $startScript = Join-Path (Get-FacultyInstallRoot) "scripts\windows\Start-FacultyAttendance.ps1"
        $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
        Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WindowStyle Hidden
    }

    $ready = $false
    for ($i = 0; $i -lt $TimeoutSeconds; $i += 2) {
        Start-Sleep -Seconds 2
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$port/login" -UseBasicParsing -TimeoutSec 3
            if ($resp.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch { }
    }

    return $ready
}

function Restart-FacultyApplication {
    param(
        [string]$ConfigPath = (Join-Path $env:ProgramData "FacultyAttendance\app.env"),
        [string]$TaskName = "FacultyAttendance",
        [int]$TimeoutSeconds = 45
    )

    $resolvedConfig = Get-FacultyConfigPath -Path $ConfigPath
    $dataRoot = Split-Path -Parent $resolvedConfig
    $logPath = Join-Path $dataRoot "logs\startup.log"

    Write-FacultyLog -Message "Executing genuine application restart operation" -LogPath $logPath

    # 1. Stop service thoroughly (kills old verified Node process, waits for port release)
    Stop-FacultyService -ConfigPath $ConfigPath -TaskName $TaskName

    # 2. Verify port is not occupied
    $port = 3000
    if (Test-Path -LiteralPath $resolvedConfig) {
        try {
            $config = Read-FacultyEnvFile -Path $resolvedConfig
            if ($config.ContainsKey("PORT")) { $port = [int]$config["PORT"] }
        } catch { }
    }
    $stillOccupied = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($stillOccupied) {
        throw "Cannot restart: Port $port is still in use by PID $(($stillOccupied | Select-Object -First 1).OwningProcess)."
    }

    # 3. Start application and wait for HTTP 200 health check
    $ok = Start-FacultyServiceInstance -ConfigPath $ConfigPath -TaskName $TaskName -TimeoutSeconds $TimeoutSeconds
    if ($ok) {
        Write-FacultyLog -Message "Application successfully restarted and responding on port $port" -LogPath $logPath
    } else {
        Write-FacultyLog -Message "Application restart: Service started but failed health check on port $port within $TimeoutSeconds seconds" -LogPath $logPath
    }
    return $ok
}
