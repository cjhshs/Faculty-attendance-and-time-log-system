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
