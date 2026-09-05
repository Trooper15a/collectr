# Installs (or removes) a shortcut in the current user's Startup folder that launches the
# Collectr server silently at login. No admin rights needed; nothing outside your user profile changes.
param([switch]$Remove)
$ErrorActionPreference = "Stop"
$startup = [Environment]::GetFolderPath("Startup")
$link = Join-Path $startup "Collectr server.lnk"
if ($Remove) {
  if (Test-Path $link) { Remove-Item $link; Write-Host "Removed $link" } else { Write-Host "Nothing to remove" }
  exit 0
}
$vbs = Join-Path $PSScriptRoot "start-collectr.vbs"
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($link)
$sc.TargetPath = "wscript.exe"
$sc.Arguments = "`"$vbs`""
$sc.WorkingDirectory = Split-Path $PSScriptRoot -Parent
$sc.Description = "Collectr TCG tracker server"
$sc.Save()
Write-Host "Installed: $link"
Write-Host "The server will start silently at every login. Starting it now..."
Start-Process wscript.exe -ArgumentList "`"$vbs`""
