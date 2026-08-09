param(
  [Parameter(Mandatory = $true)][string]$LiteNsis,
  [Parameter(Mandatory = $true)][string]$FullNsis,
  [Parameter(Mandatory = $true)][string]$LiteMsi,
  [Parameter(Mandatory = $true)][string]$FullMsi
)

$ErrorActionPreference = "Stop"

function Invoke-Installer([string]$FilePath, [string[]]$Arguments) {
  $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Installer failed with exit code $($process.ExitCode): $FilePath"
  }
}

function Get-MDViewerExecutable {
  $roots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  foreach ($root in $roots) {
    $entry = Get-ItemProperty $root -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -eq "MDViewer+" } |
      Select-Object -First 1
    if ($entry.InstallLocation -and (Test-Path $entry.InstallLocation)) {
      $executable = Get-ChildItem $entry.InstallLocation -Filter *.exe |
        Where-Object { $_.Name -notmatch "unins|uninstall" } |
        Select-Object -First 1
      if ($executable) { return $executable.FullName }
    }
  }
  $fallback = Get-ChildItem $env:LOCALAPPDATA -Filter "mdviewerplus*.exe" -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch "unins|uninstall" } |
    Select-Object -First 1
  if ($fallback) { return $fallback.FullName }
  throw "Could not locate the installed MDViewer+ executable."
}

function Get-InstalledHash {
  $path = Get-MDViewerExecutable
  return (Get-FileHash $path -Algorithm SHA256).Hash
}

function Remove-Msi([string]$Package) {
  Invoke-Installer "msiexec.exe" @("/x", "`"$Package`"", "/qn", "/norestart")
}

Invoke-Installer $LiteNsis @("/S")
$liteNsisHash = Get-InstalledHash
Invoke-Installer $FullNsis @("/S")
$fullNsisHash = Get-InstalledHash
if ($liteNsisHash -eq $fullNsisHash) {
  throw "NSIS cross-edition install did not replace the embedded application."
}

$uninstaller = Get-ChildItem (Split-Path (Get-MDViewerExecutable)) -Filter "*unins*.exe" |
  Select-Object -First 1
if ($uninstaller) { Invoke-Installer $uninstaller.FullName @("/S") }

Invoke-Installer "msiexec.exe" @("/i", "`"$LiteMsi`"", "/qn", "/norestart")
$liteMsiHash = Get-InstalledHash
Invoke-Installer "msiexec.exe" @(
  "/i", "`"$FullMsi`"", "REINSTALL=ALL", "REINSTALLMODE=vamus", "/qn", "/norestart"
)
$fullMsiHash = Get-InstalledHash
if ($liteMsiHash -eq $fullMsiHash) {
  throw "MSI cross-edition install did not replace the embedded application."
}
Remove-Msi $FullMsi
