# build.ps1 — Production build script for Sliders GL

# Strip BOM from tauri.conf.json if present (Tauri's JSON parser rejects it)
$confPath = "src-tauri\tauri.conf.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$conf = [System.IO.File]::ReadAllText($confPath, (New-Object System.Text.UTF8Encoding $true))

# If BOM was present, ReadAllText with $true strips it; rewrite without BOM
[System.IO.File]::WriteAllText($confPath, $conf, $utf8NoBom)

# Verify
$b = [System.IO.File]::ReadAllBytes($confPath)
if ($b[0] -eq 239) { Write-Error "BOM still present!"; exit 1 }

Write-Host "[build.ps1] tauri.conf.json OK (no BOM). Building..."
npm run tauri:build
