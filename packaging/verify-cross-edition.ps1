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

function Get-MDViewerExecutable([bool]$Msi = $false) {
  $roots = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  foreach ($root in $roots) {
    $entries = Get-ItemProperty $root -ErrorAction SilentlyContinue |
      Where-Object {
        $_.DisplayName -eq "MDViewer+" -and
        ($Msi -eq ($_.WindowsInstaller -eq 1))
      }
    foreach ($entry in $entries) {
      if ($entry.InstallLocation -and (Test-Path $entry.InstallLocation)) {
        $executable = Get-ChildItem $entry.InstallLocation -Filter *.exe |
          Where-Object { $_.Name -notmatch "unins|uninstall" } |
          Select-Object -First 1
        if ($executable) { return $executable.FullName }
      }
      if ($entry.DisplayIcon) {
        $displayIcon = ([string]$entry.DisplayIcon).Trim('"') -replace ',\d+$', ''
        if (Test-Path $displayIcon) { return $displayIcon }
      }
    }
  }
  $fallbackRoots = if ($Msi) {
    @($env:ProgramFiles, ${env:ProgramFiles(x86)}) | Where-Object { $_ }
  } else {
    @($env:LOCALAPPDATA)
  }
  $fallback = Get-ChildItem $fallbackRoots -Filter "mdviewerplus*.exe" -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notmatch "unins|uninstall" } |
    Select-Object -First 1
  if ($fallback) { return $fallback.FullName }
  throw "Could not locate the installed MDViewer+ executable."
}

function Get-InstalledHash([bool]$Msi = $false) {
  $path = Get-MDViewerExecutable $Msi
  $hash = (Get-FileHash $path -Algorithm SHA256).Hash
  Write-Host "Installed executable: $path ($hash)"
  return $hash
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
$liteMsiHash = Get-InstalledHash $true
Invoke-Installer "msiexec.exe" @(
  "/i", "`"$FullMsi`"", "REINSTALL=ALL", "REINSTALLMODE=vamus", "/qn", "/norestart"
)
$fullMsiHash = Get-InstalledHash $true
if ($liteMsiHash -eq $fullMsiHash) {
  throw "MSI cross-edition install did not replace the embedded application."
}
Remove-Msi $FullMsi
