[CmdletBinding()]
param(
    [switch]$SkipLaunch
)

$ErrorActionPreference = 'Stop'
$projectFile = Join-Path $PSScriptRoot 'NyravaCRM.csproj'
$publishDir = Join-Path $PSScriptRoot 'publish'

if (-not (Test-Path -LiteralPath $projectFile)) {
    throw "NyravaCRM.csproj was not found beside this installer: $PSScriptRoot"
}

$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) {
    throw 'The .NET 8 SDK is required to install from source. Install the .NET 8 SDK, reopen PowerShell, and run this script again.'
}

$sdkList = & dotnet --list-sdks
if ($LASTEXITCODE -ne 0 -or -not ($sdkList | Where-Object { $_ -match '^8\.' })) {
    throw 'The .NET 8 SDK is required. Install .NET 8 SDK, then run this script again.'
}

Write-Host 'Restoring CRM packages...'
& dotnet restore $projectFile
if ($LASTEXITCODE -ne 0) { throw 'Package restore failed. Review the error above and try again.' }

Write-Host "Publishing CRM to $publishDir ..."
& dotnet publish $projectFile -c Release --no-restore -o $publishDir
if ($LASTEXITCODE -ne 0) { throw 'CRM publish failed. Review the build errors above; the application was not started.' }

Write-Host ''
Write-Host 'Install build completed. On first start, the CRM creates all six database tables in the selected empty database.' -ForegroundColor Green
Write-Host 'Install and database setup instructions: docs\INSTALLATION.md'
Write-Host 'Integration guide: docs\INTEGRATION.md'
Write-Host 'Database schema reference: docs\DATABASE.md'

if (-not $SkipLaunch) {
    $answer = Read-Host 'Start the CRM now? [Y/n]'
    if ([string]::IsNullOrWhiteSpace($answer) -or $answer -match '^(y|yes)$') {
        & (Join-Path $PSScriptRoot 'Start-NyravaCRM.ps1')
    }
}
