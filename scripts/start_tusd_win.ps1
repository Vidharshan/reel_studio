# PowerShell script to download and run standalone tusd.exe without Docker
$tusdVersion = "v1.13.0"
$binDir = Join-Path $PSScriptRoot "..\bin"
$tusdExe = Join-Path $binDir "tusd.exe"
$uploadsDir = Join-Path $PSScriptRoot "..\uploads"

if (-not (Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir | Out-Null }
if (-not (Test-Path $uploadsDir)) { New-Item -ItemType Directory -Path $uploadsDir | Out-Null }

if (-not (Test-Path $tusdExe)) {
    Write-Host "[+] Downloading standalone tusd.exe ($tusdVersion)..." -ForegroundColor Cyan
    $zipUrl = "https://github.com/tus/tusd/releases/download/$tusdVersion/tusd_windows_amd64.zip"
    $zipPath = Join-Path $binDir "tusd.zip"
    
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $binDir -Force
    
    # Extract executable from subfolder if needed
    $extractedExe = Get-ChildItem -Path $binDir -Recurse -Filter "tusd.exe" | Select-Object -First 1
    if ($extractedExe -and $extractedExe.FullName -ne $tusdExe) {
        Move-Item -Path $extractedExe.FullName -Destination $tusdExe -Force
    }
    Remove-Item $zipPath -Force
    Write-Host "[+] tusd.exe ready!" -ForegroundColor Green
}

Write-Host "[+] Starting tusd server on http://localhost:1080/files/ ..." -ForegroundColor Green
& $tusdExe -upload-dir (Resolve-Path $uploadsDir).Path -port 1080
