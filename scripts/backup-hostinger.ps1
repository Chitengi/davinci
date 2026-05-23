param(
  [string]$ProjectRoot,
  [string]$OutputDir,
  [string]$SqlDumpPath,
  [switch]$IncludeDist,
  [switch]$IncludeNodeModules,
  [switch]$OpenOutput
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $ProjectRoot) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
} else {
  $ProjectRoot = (Resolve-Path $ProjectRoot).Path
}

if (-not $OutputDir) {
  $OutputDir = Join-Path $ProjectRoot 'backups'
}

$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("hostinger_backup_{0}" -f $timestamp)
$appStaging = Join-Path $stagingRoot 'app'

New-Item -ItemType Directory -Path $appStaging -Force | Out-Null

$excludeDirs = @(
  'node_modules',
  'backups',
  '.git',
  '.vite',
  '.cache',
  '.idea',
  '.vscode',
  'coverage',
  'tmp',
  'temp'
)

if (-not $IncludeDist) {
  $excludeDirs += 'dist'
}

if ($IncludeNodeModules) {
  $excludeDirs = $excludeDirs | Where-Object { $_ -ne 'node_modules' }
}

$projectRootNormalized = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\\')
$outputDirNormalized = [System.IO.Path]::GetFullPath($OutputDir).TrimEnd('\\')
if ($outputDirNormalized.StartsWith($projectRootNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
  $excludeDirs += $outputDirNormalized
}

$excludePatterns = @(
  '*.log',
  '*.tmp',
  '*.bak',
  '*.cache',
  '.env',
  '.env.*'
)

Write-Host "Preparing backup from: $ProjectRoot"
Write-Host "Staging backup files..."

$robocopyArgs = @(
  $ProjectRoot,
  $appStaging,
  '/E',
  '/R:1',
  '/W:1',
  '/NFL',
  '/NDL',
  '/NJH',
  '/NJS',
  '/NP'
)

if ($excludeDirs.Count -gt 0) {
  $robocopyArgs += '/XD'
  $robocopyArgs += ($excludeDirs | ForEach-Object {
    if ([System.IO.Path]::IsPathRooted($_)) { $_ } else { Join-Path $ProjectRoot $_ }
  })
}

if ($excludePatterns.Count -gt 0) {
  $robocopyArgs += '/XF'
  $robocopyArgs += $excludePatterns
}

& robocopy @robocopyArgs | Out-Null
$robocopyExitCode = $LASTEXITCODE
if ($robocopyExitCode -ge 8) {
  throw "robocopy failed with exit code $robocopyExitCode"
}

if ($SqlDumpPath) {
  if (-not (Test-Path $SqlDumpPath)) {
    throw "SQL dump not found: $SqlDumpPath"
  }

  $resolvedSqlDump = (Resolve-Path $SqlDumpPath).Path
  $dbDir = Join-Path $stagingRoot 'database'
  New-Item -ItemType Directory -Path $dbDir -Force | Out-Null
  Copy-Item -Path $resolvedSqlDump -Destination (Join-Path $dbDir (Split-Path $resolvedSqlDump -Leaf)) -Force
}

$manifestPath = Join-Path $stagingRoot 'BACKUP_MANIFEST.txt'
$manifest = @(
  "Backup Timestamp: $timestamp",
  "Project Root: $ProjectRoot",
  "Include dist: $IncludeDist",
  "Include node_modules: $IncludeNodeModules",
  "SQL dump included: $([bool]$SqlDumpPath)",
  '',
  'Important:',
  '- Verify .env values separately in a secure password manager.',
  '- This backup excludes .env and .env.* by default.',
  '- Test restore on staging before production use.'
)
$manifest | Set-Content -Path $manifestPath -Encoding UTF8

$zipPath = Join-Path $OutputDir ("hostinger_backup_{0}.zip" -f $timestamp)
if (Test-Path $zipPath) {
  Remove-Item -Path $zipPath -Force
}

Write-Host "Creating archive: $zipPath"
Compress-Archive -Path (Join-Path $stagingRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal

$cleanupTarget = $stagingRoot
Remove-Item -Path $cleanupTarget -Recurse -Force

Write-Host ''
Write-Host 'Backup completed successfully.'
Write-Host "Archive: $zipPath"
Write-Host "Size (MB): $([Math]::Round((Get-Item $zipPath).Length / 1MB, 2))"

if ($OpenOutput) {
  Invoke-Item $OutputDir
}
