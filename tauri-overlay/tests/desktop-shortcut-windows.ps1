#requires -Version 7.0
# The harness runs in pwsh; the production-script child is Windows PowerShell 5.
param()

$ErrorActionPreference = "Stop"
$root = Join-Path ([IO.Path]::GetTempPath()) ("sco-shortcut-contract-" + [Guid]::NewGuid().ToString("N"))
$resolvedRoot = [IO.Path]::GetFullPath($root)
$resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
if (-not $resolvedRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to create a fixture outside the Windows temporary directory"
}

# Exercise the actual embedded scripts, not copies of their COM implementation.
# Rust orchestration/policy still requires the Rust unit suite separately.
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../src-tauri/src/desktop_shortcut.rs') -Raw -Encoding UTF8
function Invoke-Embedded([string]$Name, [hashtable]$Values) {
    $match = [regex]::Match($source, ('(?s)const ' + $Name + ': &str = r#"(.*?)"#;'))
    if (-not $match.Success) { throw "Embedded script missing: $Name" }
    $script = $match.Groups[1].Value
    if ($Name -eq 'WRITE_SCRIPT' -or $Name -eq 'READ_SCRIPT') {
        $interop = [regex]::Match($source, '(?s)const INTEROP_SCRIPT: &str = r#"(.*?)"#;')
        if (-not $interop.Success) { throw 'Embedded script missing: INTEROP_SCRIPT' }
        $script = $interop.Groups[1].Value + [Environment]::NewLine + $script
    }
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    foreach ($argument in @('-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',$script)) {
        $info.ArgumentList.Add($argument)
    }
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [Text.Encoding]::UTF8
    foreach ($key in @($info.EnvironmentVariables.Keys)) {
        if ($key -like 'SCO_SHORTCUT_*') { $info.EnvironmentVariables.Remove($key) }
    }
    foreach ($key in $Values.Keys) { $info.EnvironmentVariables[$key] = [string]$Values[$key] }
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    try {
        if (-not $process.Start()) { throw "Cannot start embedded script: $Name" }
        if (-not $process.WaitForExit(15000)) { $process.Kill(); throw "Embedded script timed out: $Name" }
        $result = $process.StandardOutput.ReadToEnd()
        $diagnostic = $process.StandardError.ReadToEnd()
        if ($process.ExitCode -ne 0) { throw "$Name failed: $diagnostic" }
        return $result
    } finally { $process.Dispose() }
}

function New-Shortcut([string]$Path, [string]$Target) {
    Invoke-Embedded 'WRITE_SCRIPT' @{
        SCO_SHORTCUT_LINK = $Path
        SCO_SHORTCUT_TARGET = $Target
        SCO_SHORTCUT_ARGUMENTS = ''
        SCO_SHORTCUT_WORKING_DIRECTORY = (Split-Path -Parent $Target)
        SCO_SHORTCUT_ICON = $Target + ',0'
    } | Out-Null
}

function Read-Shortcut([string]$Path) {
    return (Invoke-Embedded 'READ_SCRIPT' @{ SCO_SHORTCUT_LINK = $Path } | ConvertFrom-Json)
}

function Install-Shortcut([string]$Temp, [string]$Link, [string]$Backup) {
    Invoke-Embedded 'INSTALL_SCRIPT' @{
        SCO_SHORTCUT_TEMP = $Temp
        SCO_SHORTCUT_LINK = $Link
        SCO_SHORTCUT_BACKUP = $Backup
    } | Out-Null
}

function Assert-Fields($Fields, [string]$Target) {
    if ($Fields.target_path -ne $Target -or
        $Fields.arguments -ne "" -or
        $Fields.working_directory -ne (Split-Path -Parent $Target) -or
        $Fields.icon_location -ne ($Target + ",0")) {
        throw "Shortcut field readback mismatch"
    }
}

[IO.Directory]::CreateDirectory($root) | Out-Null
try {
    $oldTarget = Join-Path $root "old & '中文'.exe"
    $newTarget = Join-Path $root "new 中文 🧪.exe"
    [IO.File]::WriteAllBytes($oldTarget, [byte[]](1, 2, 3))
    [IO.File]::WriteAllBytes($newTarget, [byte[]](4, 5, 6))

    $link = Join-Path $root "SC2 Coop Info.lnk"
    $tempLink = Join-Path $root ".SC2 Coop Info.temporary.lnk"
    $priorBackup = Join-Path $root "SC2 Coop Info.previous.lnk"
    $operationBackup = Join-Path $root "SC2 Coop Info.previous.1.lnk"
    New-Shortcut $tempLink $oldTarget
    Install-Shortcut $tempLink $link ''
    Assert-Fields (Read-Shortcut $link) $oldTarget
    New-Shortcut $priorBackup $oldTarget
    $priorBackupHash = (Get-FileHash -LiteralPath $priorBackup -Algorithm SHA256).Hash

    New-Shortcut $tempLink $newTarget
    Assert-Fields (Read-Shortcut $tempLink) $newTarget
    if (-not $tempLink.EndsWith(".lnk", [StringComparison]::OrdinalIgnoreCase)) {
        throw "Temporary shortcut lost its .lnk extension"
    }
    Install-Shortcut $tempLink $link $operationBackup
    Assert-Fields (Read-Shortcut $link) $newTarget
    Assert-Fields (Read-Shortcut $operationBackup) $oldTarget
    if ((Get-FileHash -LiteralPath $priorBackup -Algorithm SHA256).Hash -ne $priorBackupHash) {
        throw "An existing backup was overwritten"
    }

    $installedHash = (Get-FileHash -LiteralPath $link -Algorithm SHA256).Hash
    Assert-Fields (Read-Shortcut $link) $newTarget
    if ((Get-FileHash -LiteralPath $link -Algorithm SHA256).Hash -ne $installedHash) {
        throw "Idempotent read changed the installed shortcut"
    }

    New-Shortcut $tempLink $oldTarget
    $lockedHash = (Get-FileHash -LiteralPath $link -Algorithm SHA256).Hash
    $locked = [IO.File]::Open($link, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None)
    try {
        $replaceFailed = $false
        try {
            Install-Shortcut $tempLink $link (Join-Path $root "locked.previous.lnk")
        } catch {
            $replaceFailed = $true
        }
        if (-not $replaceFailed) { throw "Locked shortcut was unexpectedly replaced" }
    } finally {
        $locked.Dispose()
    }
    if ((Get-FileHash -LiteralPath $link -Algorithm SHA256).Hash -ne $lockedHash) {
        throw "Locked shortcut changed after a failed replacement"
    }

    $missingBackupDirectory = Join-Path $root "missing-directory"
    $backupFailureHash = (Get-FileHash -LiteralPath $link -Algorithm SHA256).Hash
    $replaceFailed = $false
    try {
        Install-Shortcut $tempLink $link (Join-Path $missingBackupDirectory "backup.lnk")
    } catch {
        $replaceFailed = $true
    }
    if (-not $replaceFailed) { throw "Invalid backup path unexpectedly succeeded" }
    if ((Get-FileHash -LiteralPath $link -Algorithm SHA256).Hash -ne $backupFailureHash) {
        throw "Shortcut changed after backup creation failed"
    }

    # A competing creator wins a no-clobber Move. Test corrupt, unrelated and
    # identical-field destinations; none is evidence that this operation won.
    foreach ($variant in @('corrupt', 'unrelated', 'identical')) {
        $raceLink = Join-Path $root ("race-$variant.lnk")
        $raceTemp = Join-Path $root ("race-$variant.temporary.lnk")
        New-Shortcut $raceTemp $newTarget
        if ($variant -eq 'corrupt') {
            [IO.File]::WriteAllBytes($raceLink, [byte[]](9, 8, 7))
        } elseif ($variant -eq 'unrelated') {
            New-Shortcut $raceLink $oldTarget
        } else {
            New-Shortcut $raceLink $newTarget
        }
        $externalHash = (Get-FileHash -LiteralPath $raceLink -Algorithm SHA256).Hash
        $stagedHash = (Get-FileHash -LiteralPath $raceTemp -Algorithm SHA256).Hash
        $moveFailed = $false
        try { Install-Shortcut $raceTemp $raceLink '' } catch { $moveFailed = $true }
        if (-not $moveFailed) { throw "Competing $variant destination was unexpectedly replaced" }
        if ((Get-FileHash -LiteralPath $raceLink -Algorithm SHA256).Hash -ne $externalHash) {
            throw "Competing $variant destination changed"
        }
        if ((Get-FileHash -LiteralPath $raceTemp -Algorithm SHA256).Hash -ne $stagedHash) {
            throw "Failed Move consumed or changed the staged shortcut"
        }
    }

    # Recovery uses the same no-clobber Move into an absent destination, never
    # Replace over a destination whose current ownership cannot be established.
    # Restore from a copy; the operation backup must remain recoverable.
    $restoreLink = Join-Path $root 'restore.temporary.lnk'
    $recoveredLink = Join-Path $root 'recovered.lnk'
    [IO.File]::Copy($operationBackup, $restoreLink, $false)
    $restoreFailed = $false
    try { Install-Shortcut $restoreLink $link '' } catch { $restoreFailed = $true }
    if (-not $restoreFailed) { throw 'Recovery overwrote an occupied destination' }
    if ((Get-FileHash -LiteralPath $link -Algorithm SHA256).Hash -ne $installedHash) {
        throw 'Recovery changed a destination of unknown ownership'
    }
    Install-Shortcut $restoreLink $recoveredLink ''
    Assert-Fields (Read-Shortcut $recoveredLink) $oldTarget
    Assert-Fields (Read-Shortcut $operationBackup) $oldTarget

    # Deterministically construct the documented partial Replace failure state:
    # staged replacement remains, destination is absent, old file is in backup.
    # The Rust test drives production reconciliation; here verify its embedded
    # recovery primitive preserves both evidence files while restoring the old link.
    $partialStaged = Join-Path $root 'partial.temporary.lnk'
    $partialBackup = Join-Path $root 'partial.previous.lnk'
    $partialDestination = Join-Path $root 'partial.lnk'
    $partialRestore = Join-Path $root 'partial.restore.temporary.lnk'
    New-Shortcut $partialStaged $newTarget
    [IO.File]::Copy($operationBackup, $partialBackup, $false)
    $partialStagedHash = (Get-FileHash -LiteralPath $partialStaged -Algorithm SHA256).Hash
    $partialBackupHash = (Get-FileHash -LiteralPath $partialBackup -Algorithm SHA256).Hash
    [IO.File]::Copy($partialBackup, $partialRestore, $false)
    Install-Shortcut $partialRestore $partialDestination ''
    Assert-Fields (Read-Shortcut $partialDestination) $oldTarget
    if ((Get-FileHash -LiteralPath $partialStaged -Algorithm SHA256).Hash -ne $partialStagedHash -or
        (Get-FileHash -LiteralPath $partialBackup -Algorithm SHA256).Hash -ne $partialBackupHash) {
        throw 'Partial replacement recovery changed the staging or backup evidence'
    }
    $knownDesktop = (Invoke-Embedded 'DESKTOP_SCRIPT' @{}).Trim()
    if (-not [IO.Directory]::Exists($knownDesktop)) { throw 'Known Desktop is unavailable' }

    $invalidLink = Join-Path $root 'invalid.lnk'
    [IO.File]::WriteAllBytes($invalidLink, [byte[]](1, 2, 3))
    $invalidHash = (Get-FileHash -LiteralPath $invalidLink -Algorithm SHA256).Hash
    $readFailed = $false
    try { Read-Shortcut $invalidLink | Out-Null } catch { $readFailed = $true }
    if (-not $readFailed) { throw 'Corrupt existing shortcut was accepted by the reader' }
    if ((Get-FileHash -LiteralPath $invalidLink -Algorithm SHA256).Hash -ne $invalidHash) {
        throw 'Corrupt existing shortcut was changed during inspection'
    }

    [pscustomobject]@{
        embedded_production_scripts = $true
        known_desktop_resolved_read_only = $true
        four_fields_read_back = $true
        unicode_and_shell_metacharacters = $true
        idempotent_read_unchanged = $true
        existing_backup_preserved = $true
        locked_link_preserved = $true
        backup_failure_preserved = $true
        rollback_backup_preserved = $true
        competing_destinations_preserved = $true
        failed_move_staging_preserved = $true
        recovery_is_no_clobber = $true
        partial_replace_recovery_preserves_evidence = $true
        corrupt_existing_link_rejected_without_write = $true
    } | ConvertTo-Json -Compress
} finally {
    $cleanupRoot = [IO.Path]::GetFullPath($root)
    if (-not $cleanupRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean a fixture outside the Windows temporary directory"
    }
    if ([IO.Directory]::Exists($cleanupRoot)) {
        Remove-Item -LiteralPath $cleanupRoot -Recurse -Force
    }
}
