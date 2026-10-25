[CmdletBinding()]
param(
    [ValidateSet('Sqlite', 'SqlServer', 'MySql')]
    [string]$DatabaseProvider,
    [switch]$Demo
)

$ErrorActionPreference = 'Stop'
$originalProvider = $env:Database__Provider
$originalConnection = $env:ConnectionStrings__Crm
$originalDemoMode = $env:CRM_DEMO_MODE
$originalCookieSecure = $env:Crm__CookieSecure
$originalUrls = $env:ASPNETCORE_URLS
$publishDir = Join-Path $PSScriptRoot 'publish'
$appDll = Join-Path $publishDir 'NyravaCRM.dll'
if (-not (Test-Path -LiteralPath $appDll)) {
    throw 'Published CRM was not found. Run .\Install-NyravaCRM.ps1 first.'
}

if ($Demo -and [string]::IsNullOrWhiteSpace($DatabaseProvider)) {
    $DatabaseProvider = 'Sqlite'
}

if ([string]::IsNullOrWhiteSpace($DatabaseProvider)) {
    $configuredProvider = $env:Database__Provider
    if ($configuredProvider -in @('Sqlite', 'SqlServer', 'MySql')) {
        $DatabaseProvider = $configuredProvider
    } else {
        Write-Host 'Select database: [1] SQLite (default)  [2] SQL Server 2022  [3] MySQL'
        $choice = Read-Host 'Enter 1, 2, or 3'
        $DatabaseProvider = switch ($choice) {
            '2' { 'SqlServer' }
            '3' { 'MySql' }
            default { 'Sqlite' }
        }
    }
}

if ($Demo -and $DatabaseProvider -ne 'Sqlite') {
    throw 'The sample demo uses its own SQLite database. Start the demo with -DatabaseProvider Sqlite.'
}

$env:Database__Provider = $DatabaseProvider
if ($DatabaseProvider -eq 'Sqlite') {
    Remove-Item Env:ConnectionStrings__Crm -ErrorAction SilentlyContinue
}
if ($DatabaseProvider -ne 'Sqlite' -and [string]::IsNullOrWhiteSpace($env:ConnectionStrings__Crm)) {
    if ($DatabaseProvider -eq 'SqlServer') {
        Write-Host 'Example: Server=localhost;Database=NyravaCrm;Trusted_Connection=True;TrustServerCertificate=True'
    } else {
        Write-Host 'Example: Server=localhost;Database=nyrava_crm;User=nyrava_crm_app;Password=...'
    }
    $secureConnection = Read-Host 'Paste the full database connection string (input is hidden)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureConnection)
    try {
        $env:ConnectionStrings__Crm = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    if ([string]::IsNullOrWhiteSpace($env:ConnectionStrings__Crm)) {
        throw 'A database connection string is required for this provider.'
    }
}

if ($Demo) {
    $env:CRM_DEMO_MODE = 'true'
    $port = 5181
} else {
    Remove-Item Env:CRM_DEMO_MODE -ErrorAction SilentlyContinue
    $port = 5180
}
$url = "http://localhost:$port"
$env:ASPNETCORE_URLS = $url
$env:Crm__CookieSecure = 'false'

Write-Host ''
Write-Host "Starting Nyrava CRM using $DatabaseProvider at $url" -ForegroundColor Green
Write-Host 'The first startup creates the CRM tables. Wait for the startup message, then open the URL above.'
Write-Host 'Press Ctrl+C in this window to stop the CRM.'
Push-Location $publishDir
try {
    & dotnet $appDll
    if ($LASTEXITCODE -ne 0) { throw "The CRM stopped with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
    if ($null -eq $originalProvider) { Remove-Item Env:Database__Provider -ErrorAction SilentlyContinue } else { $env:Database__Provider = $originalProvider }
    if ($null -eq $originalConnection) { Remove-Item Env:ConnectionStrings__Crm -ErrorAction SilentlyContinue } else { $env:ConnectionStrings__Crm = $originalConnection }
    if ($null -eq $originalDemoMode) { Remove-Item Env:CRM_DEMO_MODE -ErrorAction SilentlyContinue } else { $env:CRM_DEMO_MODE = $originalDemoMode }
    if ($null -eq $originalCookieSecure) { Remove-Item Env:Crm__CookieSecure -ErrorAction SilentlyContinue } else { $env:Crm__CookieSecure = $originalCookieSecure }
    if ($null -eq $originalUrls) { Remove-Item Env:ASPNETCORE_URLS -ErrorAction SilentlyContinue } else { $env:ASPNETCORE_URLS = $originalUrls }
}
