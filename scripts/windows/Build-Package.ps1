[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$SkipTests,
    [switch]$SkipLint,
    [switch]$BundleNode,
    [switch]$Force,
    [switch]$Zip,
    [string]$OutputRoot
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $OutputRoot) { $OutputRoot = Join-Path $root "dist" }
$packageRoot = Join-Path $OutputRoot "FacultyAttendance"
$appRoot = Join-Path $packageRoot "app"

function Invoke-Checked {
    param([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory)
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

function Copy-Tree {
    param([string]$Source, [string]$Destination, [string[]]$ExcludeDirectories = @())
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    $arguments = @($Source, $Destination, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/nc", "/ns", "/np")
    if ($ExcludeDirectories.Count -gt 0) {
        $arguments += "/XD"
        $arguments += $ExcludeDirectories
    }
    & robocopy.exe @arguments | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed for $Source (exit $LASTEXITCODE)" }
}

if (-not $SkipBuild) {
    Write-Host "Building production application..."
    Invoke-Checked -FilePath "npm.cmd" -Arguments @("run", "build") -WorkingDirectory $root
}
if (-not $SkipTests) {
    Write-Host "Running test suite..."
    Invoke-Checked -FilePath "npm.cmd" -Arguments @("test") -WorkingDirectory $root
}
if (-not $SkipLint) {
    Write-Host "Running linter..."
    Invoke-Checked -FilePath "npm.cmd" -Arguments @("run", "lint") -WorkingDirectory $root
}

$buildId = Join-Path $root ".next\BUILD_ID"
if (-not (Test-Path -LiteralPath $buildId -PathType Leaf)) {
    throw "No production build found at $buildId. Run without -SkipBuild first."
}

if (Test-Path -LiteralPath $packageRoot) {
    if (-not $Force) { throw "Package output already exists: $packageRoot. Use -Force to replace it." }
    Remove-Item -LiteralPath $packageRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $appRoot | Out-Null

Write-Host "Copying runtime files..."
$appItems = @(".next", "node_modules", "public", "prisma", "src", "docs", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", ".env.example")
foreach ($item in $appItems) {
    $source = Join-Path $root $item
    if (-not (Test-Path -LiteralPath $source)) { throw "Required package source is missing: $item" }
    $destination = Join-Path $appRoot $item
    if ((Get-Item -LiteralPath $source).PSIsContainer) {
        $excludes = @()
        if ($item -eq ".next") {
            $excludes = @((Join-Path $source "cache"), (Join-Path $source "dev"))
        }
        Copy-Tree -Source $source -Destination $destination -ExcludeDirectories $excludes
    }
    else {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Force
    }
}

Copy-Tree -Source (Join-Path $root "scripts\windows") -Destination (Join-Path $packageRoot "scripts\windows")
Copy-Item -LiteralPath (Join-Path $root "docs\WINDOWS-INSTALL.md") -Destination (Join-Path $packageRoot "README-INSTALL.md") -Force -ErrorAction SilentlyContinue

Get-ChildItem -LiteralPath (Join-Path $appRoot "node_modules\.prisma\client") -Filter "*.tmp*" -File -ErrorAction SilentlyContinue | Remove-Item -Force
Get-ChildItem -LiteralPath (Join-Path $appRoot "node_modules\@next") -Directory -Filter ".swc-win32-x64-msvc-*" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
foreach ($cache in @("node_modules\.cache", "node_modules\.vite", "node_modules\.eslintcache")) {
    $cachePath = Join-Path $appRoot $cache
    if (Test-Path -LiteralPath $cachePath) { Remove-Item -LiteralPath $cachePath -Recurse -Force }
}

if ($BundleNode) {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $runtime = Join-Path $packageRoot "runtime"
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    Copy-Item -LiteralPath $node -Destination (Join-Path $runtime "node.exe") -Force
    Write-Host "Bundled Node runtime from $node"
}

$missing = @()
$required = @(
    "app\.next\BUILD_ID",
    "app\node_modules\next\dist\bin\next",
    "app\node_modules\prisma\build\index.js",
    "app\node_modules\tsx\dist\cli.mjs",
    "app\prisma\schema.prisma",
    "scripts\windows\Start-FacultyAttendance.ps1",
    "scripts\windows\Setup-FacultyAttendance.ps1",
    "scripts\windows\Backup-Database.ps1",
    "scripts\windows\Restore-Database.ps1"
)
foreach ($relative in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $packageRoot $relative))) { $missing += $relative }
}
if ($missing.Count -gt 0) { throw "Package validation failed; missing: $($missing -join ', ')" }

$forbidden = Get-ChildItem -LiteralPath $packageRoot -Recurse -Force -File | Where-Object {
    $_.Name -eq ".env" -or $_.Name -like "*.dump" -or $_.FullName -match "\\backups\\"
}
if ($forbidden) { throw "Package contains forbidden files: $($forbidden.FullName -join ', ')" }

$version = "unknown"
$commit = "unknown"
try { $version = (Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version } catch { }
try { $commit = (& git -C $root rev-parse --short HEAD 2>$null) } catch { }
$nodeVersion = (& node --version)
$info = @(
    "Faculty Attendance package",
    "Built: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')",
    "App version: $version",
    "Git commit: $commit",
    "Node: $nodeVersion",
    "Bundle includes Prisma migrations and client; no .env or database backups."
)
[System.IO.File]::WriteAllLines((Join-Path $packageRoot "BUILD-INFO.txt"), $info, (New-Object System.Text.UTF8Encoding($false)))

$size = (Get-ChildItem -LiteralPath $packageRoot -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Host ("Package ready: {0} ({1:N1} MB)" -f $packageRoot, $size)

if ($Zip) {
    $zipPath = Join-Path $OutputRoot "FacultyAttendance.zip"
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal
    Write-Host "Archive: $zipPath"
}
