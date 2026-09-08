use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShortcutUpdate {
    Created(PathBuf),
    Unchanged(PathBuf),
    Replaced { path: PathBuf, backup: PathBuf },
}

impl ShortcutUpdate {
    pub fn path(&self) -> &PathBuf {
        match self {
            Self::Created(path) | Self::Unchanged(path) => path,
            Self::Replaced { path, .. } => path,
        }
    }

    pub fn message(&self) -> &'static str {
        match self {
            Self::Created(_) => "Desktop shortcut created",
            Self::Unchanged(_) => "Desktop shortcut already up to date",
            Self::Replaced { .. } => "Desktop shortcut replaced",
        }
    }
}

#[cfg(windows)]
mod windows_shortcut {
    use super::ShortcutUpdate;
    use crate::bounded_process::{BoundedOutput, run_bounded};
    use serde::Deserialize;
    use std::{
        ffi::OsString,
        fs,
        os::windows::process::CommandExt,
        path::{Path, PathBuf},
        process::Command,
        sync::atomic::{AtomicBool, Ordering},
        time::{Duration, SystemTime, UNIX_EPOCH},
    };
    use windows::{
        Win32::{
            Foundation::{CloseHandle, ERROR_ALREADY_EXISTS, GetLastError, HANDLE},
            System::Threading::{CreateMutexW, ReleaseMutex},
        },
        core::w,
    };

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const POWERSHELL_TIMEOUT: Duration = Duration::from_secs(15);
    const HELPER_OUTPUT_LIMIT: usize = 64 * 1024;
    static HELPER_STATE_UNCERTAIN: AtomicBool = AtomicBool::new(false);
    const SHORTCUT_NAME: &str = "SC2 Coop Info.lnk";
    const INTEROP_SCRIPT: &str = r#"
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

[ComImport, Guid("000214F9-0000-0000-C000-000000000046"),
 InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int capacity, IntPtr findData, uint flags);
    void GetIDList(out IntPtr itemIdList);
    void SetIDList(IntPtr itemIdList);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder description, int capacity);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string description);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder directory, int capacity);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string directory);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder arguments, int capacity);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string arguments);
    void GetHotkey(out short hotkey);
    void SetHotkey(short hotkey);
    void GetShowCmd(out int showCommand);
    void SetShowCmd(int showCommand);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder iconPath, int capacity, out int iconIndex);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string iconPath, int iconIndex);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
    void Resolve(IntPtr window, uint flags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
}

[ComImport, Guid("00021401-0000-0000-C000-000000000046")]
class ShellLink {}

public static class UnicodeShellLink {
    const int BufferCapacity = 32768;

    public static void Write(string target, string arguments, string workingDirectory,
                             string iconPath, int iconIndex, string linkPath) {
        IShellLinkW link = (IShellLinkW)new ShellLink();
        try {
            link.SetPath(target);
            link.SetArguments(arguments);
            link.SetWorkingDirectory(workingDirectory);
            link.SetIconLocation(iconPath, iconIndex);
            ((IPersistFile)link).Save(linkPath, true);
        } finally { Marshal.FinalReleaseComObject(link); }
    }

    public static string[] Read(string linkPath) {
        IShellLinkW link = (IShellLinkW)new ShellLink();
        try {
            ((IPersistFile)link).Load(linkPath, 0);
            StringBuilder target = new StringBuilder(BufferCapacity);
            StringBuilder arguments = new StringBuilder(BufferCapacity);
            StringBuilder workingDirectory = new StringBuilder(BufferCapacity);
            StringBuilder iconPath = new StringBuilder(BufferCapacity);
            int iconIndex;
            link.GetPath(target, target.Capacity, IntPtr.Zero, 4);
            link.GetArguments(arguments, arguments.Capacity);
            link.GetWorkingDirectory(workingDirectory, workingDirectory.Capacity);
            link.GetIconLocation(iconPath, iconPath.Capacity, out iconIndex);
            return new [] { target.ToString(), arguments.ToString(), workingDirectory.ToString(),
                            iconPath.ToString() + "," + iconIndex.ToString() };
        } finally { Marshal.FinalReleaseComObject(link); }
    }
}
'@
"#;
    const DESKTOP_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $OutputEncoding
[Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
"#;
    const WRITE_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $OutputEncoding
if ([string]::IsNullOrWhiteSpace($env:SCO_SHORTCUT_TARGET)) { throw 'Shortcut target environment is empty' }
if (-not (Test-Path -LiteralPath $env:SCO_SHORTCUT_TARGET -PathType Leaf)) { throw 'Shortcut target does not exist in helper environment' }
$iconPath, $iconIndex = $env:SCO_SHORTCUT_ICON -split ',(?=[^,]*$)', 2
[UnicodeShellLink]::Write($env:SCO_SHORTCUT_TARGET, $env:SCO_SHORTCUT_ARGUMENTS,
  $env:SCO_SHORTCUT_WORKING_DIRECTORY, $iconPath, [int]$iconIndex, $env:SCO_SHORTCUT_LINK)
"#;
    const READ_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $OutputEncoding
$fields = [UnicodeShellLink]::Read($env:SCO_SHORTCUT_LINK)
if ([string]::IsNullOrWhiteSpace($fields[0])) {
  throw 'Shortcut TargetPath is empty'
}
[ordered]@{
  target_path = $fields[0]
  arguments = $fields[1]
  working_directory = $fields[2]
  icon_location = $fields[3]
} | ConvertTo-Json -Compress
"#;
    const INSTALL_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $OutputEncoding
if ($env:SCO_SHORTCUT_BACKUP) {
  [IO.File]::Replace($env:SCO_SHORTCUT_TEMP, $env:SCO_SHORTCUT_LINK, $env:SCO_SHORTCUT_BACKUP, $true)
} else {
  [IO.File]::Move($env:SCO_SHORTCUT_TEMP, $env:SCO_SHORTCUT_LINK)
}
"#;
    const RESTORE_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $OutputEncoding
[IO.File]::Replace(
  $env:SCO_SHORTCUT_RESTORE,
  $env:SCO_SHORTCUT_LINK,
  [NullString]::Value,
  $true
)
"#;

    #[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
    struct ShortcutFields {
        target_path: String,
        arguments: String,
        working_directory: String,
        icon_location: String,
    }

    impl ShortcutFields {
        fn for_target(target: &Path) -> Result<Self, String> {
            let parent = target
                .parent()
                .ok_or_else(|| "shortcut target has no parent directory".to_string())?;
            Ok(Self {
                target_path: target.to_string_lossy().into_owned(),
                arguments: String::new(),
                working_directory: parent.to_string_lossy().into_owned(),
                icon_location: format!("{},0", target.display()),
            })
        }

        fn matches(&self, expected: &Self) -> bool {
            equivalent_path(&self.target_path, &expected.target_path)
                && self.arguments == expected.arguments
                && equivalent_path(&self.working_directory, &expected.working_directory)
                && equivalent_icon(&self.icon_location, &expected.icon_location)
        }
    }

    struct TempShortcut {
        path: PathBuf,
        remove_on_drop: bool,
    }

    impl TempShortcut {
        fn new(path: PathBuf) -> Self {
            Self {
                path,
                remove_on_drop: true,
            }
        }

        fn preserve(&mut self) {
            self.remove_on_drop = false;
        }
    }

    impl Drop for TempShortcut {
        fn drop(&mut self) {
            if self.remove_on_drop
                && !HELPER_STATE_UNCERTAIN.load(Ordering::Acquire)
                && self.path.exists()
            {
                let _ = fs::remove_file(&self.path);
            }
        }
    }

    struct UpdateLock(HANDLE);

    impl UpdateLock {
        fn acquire() -> Result<Self, String> {
            let handle = unsafe {
                CreateMutexW(
                    None,
                    true,
                    w!("Local\\SC2CoopInfoDesktopShortcutUpdate"),
                )
            }
            .map_err(|error| format!("cannot create shortcut update mutex: {error}"))?;
            if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
                let _ = unsafe { CloseHandle(handle) };
                return Err("another shortcut update is active".into());
            }
            Ok(Self(handle))
        }
    }

    impl Drop for UpdateLock {
        fn drop(&mut self) {
            let _ = unsafe { ReleaseMutex(self.0) };
            let _ = unsafe { CloseHandle(self.0) };
        }
    }

    pub fn create_or_update() -> Result<ShortcutUpdate, String> {
        ensure_helper_state_known()?;
        if cfg!(debug_assertions) {
            return Err("Create desktop shortcut is not available in this build".into());
        }
        let target = std::env::current_exe()
            .map_err(|error| format!("cannot resolve executable: {error}"))?
            .canonicalize()
            .map(strip_verbatim_prefix)
            .map_err(|error| format!("cannot resolve executable path: {error}"))?;
        validate_target(&target)?;

        // The Windows known-folder mapping follows a Desktop redirected to OneDrive.
        let desktop_text = run_powershell(DESKTOP_SCRIPT, &[])?;
        let desktop = PathBuf::from(desktop_text.trim_start_matches('\u{feff}').trim());
        if !desktop.is_dir() {
            return Err(format!(
                "Windows known Desktop directory does not exist: {}",
                desktop.display()
            ));
        }
        create_or_update_at(&target, &desktop.join(SHORTCUT_NAME))
    }

    fn create_or_update_at(target: &Path, link: &Path) -> Result<ShortcutUpdate, String> {
        ensure_helper_state_known()?;
        if !target.is_file() {
            return Err(format!("shortcut target does not exist: {}", target.display()));
        }
        // Give all callers the same resolved Shell-compatible path used by the
        // public current_exe entry point, including explicit fixture paths.
        let target = target
            .canonicalize()
            .map(strip_verbatim_prefix)
            .map_err(|error| format!("cannot resolve shortcut target path: {error}"))?;
        let link_parent = link
            .parent()
            .ok_or_else(|| "shortcut path has no parent directory".to_string())?;
        if !link_parent.is_dir() {
            return Err(format!(
                "shortcut directory does not exist: {}",
                link_parent.display()
            ));
        }

        let _lock = UpdateLock::acquire()?;
        let expected = ShortcutFields::for_target(&target)?;
        let previous = if link.is_file() {
            let fields = read_fields(link).map_err(|error| {
                format!("cannot inspect existing shortcut; it was left unchanged: {error}")
            })?;
            if fields.matches(&expected) {
                return Ok(ShortcutUpdate::Unchanged(link.to_path_buf()));
            }
            Some(fields)
        } else if link.exists() {
            return Err(format!(
                "shortcut path is not a regular file: {}",
                link.display()
            ));
        } else {
            None
        };

        let mut temp = TempShortcut::new(unique_temp_link(link));
        if let Err(error) = write_shortcut(&expected, &temp.path) {
            if HELPER_STATE_UNCERTAIN.load(Ordering::Acquire) {
                temp.preserve();
            }
            return Err(error);
        }
        let staged_fields = match read_fields(&temp.path) {
            Ok(fields) => fields,
            Err(error) => {
                if HELPER_STATE_UNCERTAIN.load(Ordering::Acquire) {
                    temp.preserve();
                }
                return Err(error);
            }
        };
        if !staged_fields.matches(&expected) {
            return Err("shortcut verification failed before installation".into());
        }

        let backup = link.is_file().then(|| available_backup_path(link)).transpose()?;
        install_shortcut(
            &mut temp,
            link,
            backup.as_deref(),
            &expected,
            previous.as_ref(),
        )?;
        match read_fields(link) {
            Ok(fields) if fields.matches(&expected) => {}
            result => {
                let verification = match result {
                    Ok(_) => "shortcut verification failed after installation".to_string(),
                    Err(error) => format!("cannot verify installed shortcut: {error}"),
                };
                if HELPER_STATE_UNCERTAIN.load(Ordering::Acquire) {
                    temp.preserve();
                    return Err(format!(
                        "{verification}; helper termination is unconfirmed, so transaction evidence was preserved and shortcut updates are disabled until application restart"
                    ));
                }
                return Err(match rollback_failed_install(link, backup.as_deref()) {
                    Ok(outcome) => format!("{verification}; {outcome}"),
                    Err(rollback) => format!("{verification}; rollback failed: {rollback}"),
                });
            }
        }

        Ok(match backup {
            Some(backup) => ShortcutUpdate::Replaced {
                path: link.to_path_buf(),
                backup,
            },
            None => ShortcutUpdate::Created(link.to_path_buf()),
        })
    }

    fn ensure_helper_state_known() -> Result<(), String> {
        if HELPER_STATE_UNCERTAIN.load(Ordering::Acquire) {
            Err(
                "a previous shortcut helper could not be confirmed stopped; restart the application and inspect the shortcut before retrying"
                    .into(),
            )
        } else {
            Ok(())
        }
    }

    fn validate_target(target: &Path) -> Result<(), String> {
        if !target.is_absolute() || !target.is_file() {
            return Err(format!(
                "shortcut target is not an absolute executable file: {}",
                target.display()
            ));
        }
        if !target
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
        {
            return Err(format!(
                "shortcut target is not a Windows executable: {}",
                target.display()
            ));
        }
        let normalized = resolved_normalized_path(target);
        if normalized.contains("\\target\\debug\\")
            || normalized.contains("\\target\\release\\")
        {
            return Err("Create desktop shortcut is not available for a build-output executable".into());
        }
        if let Some(temp) = std::env::var_os("TEMP") {
            let temp = resolved_normalized_path(Path::new(&temp));
            if !temp.is_empty() && (normalized == temp || normalized.starts_with(&(temp + "\\"))) {
                return Err("Create desktop shortcut is not available for a temporary executable".into());
            }
        }
        Ok(())
    }

    fn write_shortcut(fields: &ShortcutFields, link: &Path) -> Result<(), String> {
        let environment = [
            ("SCO_SHORTCUT_LINK", link.as_os_str().to_os_string()),
            ("SCO_SHORTCUT_TARGET", OsString::from(&fields.target_path)),
            ("SCO_SHORTCUT_ARGUMENTS", OsString::from(&fields.arguments)),
            (
                "SCO_SHORTCUT_WORKING_DIRECTORY",
                OsString::from(&fields.working_directory),
            ),
            ("SCO_SHORTCUT_ICON", OsString::from(&fields.icon_location)),
        ];
        let script = format!("{INTEROP_SCRIPT}\n{WRITE_SCRIPT}");
        run_powershell(&script, &environment)?;
        if !link.is_file() {
            return Err("Windows shortcut writer did not create a .lnk file".into());
        }
        Ok(())
    }

    fn read_fields(link: &Path) -> Result<ShortcutFields, String> {
        let environment = [("SCO_SHORTCUT_LINK", link.as_os_str().to_os_string())];
        let script = format!("{INTEROP_SCRIPT}\n{READ_SCRIPT}");
        let output = run_powershell(&script, &environment)?;
        serde_json::from_str(output.trim_start_matches('\u{feff}').trim())
            .map_err(|error| format!("invalid shortcut readback: {error}"))
    }

    fn install_shortcut(
        temp: &mut TempShortcut,
        link: &Path,
        backup: Option<&Path>,
        expected: &ShortcutFields,
        previous: Option<&ShortcutFields>,
    ) -> Result<(), String> {
        let mut environment = vec![
            ("SCO_SHORTCUT_TEMP", temp.path.as_os_str().to_os_string()),
            ("SCO_SHORTCUT_LINK", link.as_os_str().to_os_string()),
        ];
        if let Some(backup) = backup {
            environment.push(("SCO_SHORTCUT_BACKUP", backup.as_os_str().to_os_string()));
        }
        match run_powershell_detailed(INSTALL_SCRIPT, &environment) {
            Ok(_) => Ok(()),
            Err(failure) if !failure.cleanup_confirmed => {
                temp.preserve();
                Err(format!(
                    "{}; helper termination is unconfirmed, so the staged shortcut and any backup were preserved and shortcut updates are disabled until application restart",
                    failure.message
                ))
            }
            Err(failure) => {
                let result = reconcile_failed_install(
                    link,
                    backup,
                    expected,
                    previous,
                    &failure.message,
                );
                if HELPER_STATE_UNCERTAIN.load(Ordering::Acquire) {
                    temp.preserve();
                }
                result
            }
        }
    }

    fn reconcile_failed_install(
        link: &Path,
        backup: Option<&Path>,
        expected: &ShortcutFields,
        previous: Option<&ShortcutFields>,
        helper_error: &str,
    ) -> Result<(), String> {
        match read_fields(link) {
            Ok(fields) if fields.matches(expected) => Ok(()),
            Ok(fields)
                if previous.is_some_and(|previous| fields.matches(previous))
                    && backup.is_none_or(|backup| !backup.exists()) =>
            {
                Err(format!(
                    "{helper_error}; previous shortcut was inspected and remains unchanged"
                ))
            }
            inspection => {
                let observed = match inspection {
                    Ok(_) => "installed shortcut has unexpected fields".to_string(),
                    Err(error) if link.exists() => {
                        format!("installed shortcut cannot be inspected: {error}")
                    }
                    Err(error) => format!("shortcut is absent after helper failure: {error}"),
                };
                if HELPER_STATE_UNCERTAIN.load(Ordering::Acquire) {
                    return Err(format!(
                        "{helper_error}; {observed}; inspection helper termination is unconfirmed, so transaction evidence was preserved and shortcut updates are disabled until application restart"
                    ));
                }
                Err(match rollback_failed_install(link, backup) {
                    Ok(outcome) => format!("{helper_error}; {observed}; {outcome}"),
                    Err(rollback) => {
                        format!("{helper_error}; {observed}; rollback failed: {rollback}")
                    }
                })
            }
        }
    }

    fn rollback_failed_install(link: &Path, backup: Option<&Path>) -> Result<String, String> {
        ensure_helper_state_known()?;
        match backup {
            Some(backup) if backup.is_file() && link.is_file() => {
                let mut restore = TempShortcut::new(unique_temp_link(link));
                fs::copy(backup, &restore.path).map_err(|error| {
                    format!(
                        "cannot stage {} for restore: {error}; backup remains at {}",
                        backup.display(),
                        backup.display()
                    )
                })?;
                let environment = [
                    (
                        "SCO_SHORTCUT_RESTORE",
                        restore.path.as_os_str().to_os_string(),
                    ),
                    ("SCO_SHORTCUT_LINK", link.as_os_str().to_os_string()),
                ];
                if let Err(error) = run_powershell(RESTORE_SCRIPT, &environment) {
                    if HELPER_STATE_UNCERTAIN.load(Ordering::Acquire) {
                        restore.preserve();
                    }
                    return Err(format!("{error}; backup remains at {}", backup.display()));
                }
                Ok(format!(
                    "previous shortcut restored; backup preserved at {}",
                    backup.display()
                ))
            }
            Some(backup) if backup.is_file() && !link.exists() => {
                let restore = TempShortcut::new(unique_temp_link(link));
                fs::copy(backup, &restore.path).map_err(|error| {
                    format!(
                        "cannot stage {} for restore: {error}; backup remains at {}",
                        backup.display(),
                        backup.display()
                    )
                })?;
                fs::rename(&restore.path, link).map_err(|error| {
                    format!(
                        "cannot restore missing shortcut: {error}; backup remains at {}",
                        backup.display()
                    )
                })?;
                Ok(format!(
                    "previous shortcut restored; backup preserved at {}",
                    backup.display()
                ))
            }
            None if link.is_file() => {
                fs::remove_file(link)
                    .map(|()| "new shortcut removed".to_string())
                    .map_err(|error| format!("cannot remove new shortcut: {error}"))
            }
            Some(backup) => Err(format!(
                "cannot restore because the installed shortcut or backup is missing; expected backup at {}",
                backup.display()
            )),
            None => Ok("no shortcut remains installed".to_string()),
        }
    }

    fn available_backup_path(link: &Path) -> Result<PathBuf, String> {
        let stem = link
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("shortcut");
        let base = link.with_file_name(format!("{stem}.previous.lnk"));
        if !base.exists() {
            return Ok(base);
        }
        for suffix in 1..=10_000 {
            let candidate = link.with_file_name(format!("{stem}.previous.{suffix}.lnk"));
            if !candidate.exists() {
                return Ok(candidate);
            }
        }
        Err("cannot allocate a unique shortcut backup path".into())
    }

    fn unique_temp_link(link: &Path) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let name = link
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("shortcut");
        link.with_file_name(format!(
            ".{name}.{}.{}.temporary.lnk",
            std::process::id(),
            nonce
        ))
    }

    fn equivalent_path(actual: &str, expected: &str) -> bool {
        let normalize = |value: &str| {
            Path::new(value)
                .canonicalize()
                .map(|path| normalized_path(&path))
                .unwrap_or_else(|_| normalized_path(Path::new(value)))
        };
        normalize(actual) == normalize(expected)
    }

    fn equivalent_icon(actual: &str, expected: &str) -> bool {
        let actual = actual.rsplit_once(',');
        let expected = expected.rsplit_once(',');
        match (actual, expected) {
            (Some((actual_path, actual_index)), Some((expected_path, expected_index))) => {
                actual_index.trim() == expected_index.trim()
                    && equivalent_path(
                        actual_path.trim().trim_matches('"'),
                        expected_path.trim().trim_matches('"'),
                    )
            }
            _ => false,
        }
    }

    fn normalized_path(path: &Path) -> String {
        strip_verbatim_prefix(path.to_path_buf())
            .to_string_lossy()
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_lowercase()
    }

    fn resolved_normalized_path(path: &Path) -> String {
        path.canonicalize()
            .map(|path| normalized_path(&path))
            .unwrap_or_else(|_| normalized_path(path))
    }

    fn strip_verbatim_prefix(path: PathBuf) -> PathBuf {
        let text = path.to_string_lossy();
        if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
            PathBuf::from(format!(r"\\{rest}"))
        } else if let Some(rest) = text.strip_prefix(r"\\?\") {
            PathBuf::from(rest)
        } else {
            path
        }
    }

    fn powershell_path() -> Result<PathBuf, String> {
        let system_root = std::env::var_os("SystemRoot")
            .ok_or_else(|| "SystemRoot is unavailable".to_string())?;
        let path = PathBuf::from(system_root)
            .join("System32")
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe");
        path.is_file()
            .then_some(path.clone())
            .ok_or_else(|| format!("Windows PowerShell is unavailable: {}", path.display()))
    }

    struct HelperFailure {
        message: String,
        cleanup_confirmed: bool,
    }

    fn run_powershell(script: &str, environment: &[(&str, OsString)]) -> Result<String, String> {
        run_powershell_detailed(script, environment).map_err(|failure| failure.message)
    }

    fn run_powershell_detailed(
        script: &str,
        environment: &[(&str, OsString)],
    ) -> Result<String, HelperFailure> {
        ensure_helper_state_known().map_err(|message| HelperFailure {
            message,
            cleanup_confirmed: false,
        })?;
        let path = powershell_path().map_err(|message| HelperFailure {
            message,
            cleanup_confirmed: true,
        })?;
        let mut command = Command::new(path);
        command
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ])
            .creation_flags(CREATE_NO_WINDOW);
        for name in [
            "SCO_SHORTCUT_LINK",
            "SCO_SHORTCUT_TARGET",
            "SCO_SHORTCUT_ARGUMENTS",
            "SCO_SHORTCUT_WORKING_DIRECTORY",
            "SCO_SHORTCUT_ICON",
            "SCO_SHORTCUT_TEMP",
            "SCO_SHORTCUT_BACKUP",
            "SCO_SHORTCUT_RESTORE",
        ] {
            command.env_remove(name);
        }
        for (name, value) in environment {
            command.env(name, value);
        }
        let output = run_bounded(&mut command, POWERSHELL_TIMEOUT, HELPER_OUTPUT_LIMIT).map_err(
            |error| HelperFailure {
                message: format!("cannot start Windows shortcut helper: {error}"),
                cleanup_confirmed: true,
            },
        )?;
        if !output.cleanup_confirmed {
            HELPER_STATE_UNCERTAIN.store(true, Ordering::Release);
        }
        if output.timed_out {
            return Err(HelperFailure {
                message: format_helper_timeout(&output),
                cleanup_confirmed: output.cleanup_confirmed,
            });
        }
        if let Some(cleanup) = &output.cleanup_error {
            return Err(HelperFailure {
                message: format!("Windows shortcut helper cleanup failed: {cleanup}"),
                cleanup_confirmed: output.cleanup_confirmed,
            });
        }
        if !output.status.is_some_and(|status| status.success()) {
            let diagnostic = helper_diagnostic(&output);
            let message = if diagnostic.is_empty() {
                match output.status {
                    Some(status) => format!("Windows shortcut helper exited with {status}"),
                    None => "Windows shortcut helper exited without a status".to_string(),
                }
            } else {
                format!("Windows shortcut helper failed: {diagnostic}")
            };
            return Err(HelperFailure {
                message,
                cleanup_confirmed: output.cleanup_confirmed,
            });
        }
        String::from_utf8(output.stdout).map_err(|error| HelperFailure {
            message: format!("Windows shortcut helper returned invalid UTF-8: {error}"),
            cleanup_confirmed: output.cleanup_confirmed,
        })
    }

    fn format_helper_timeout(output: &BoundedOutput) -> String {
        let status = output
            .status
            .map(|status| format!("; terminated with {status}"))
            .unwrap_or_default();
        let cleanup = output
            .cleanup_error
            .as_ref()
            .map(|error| format!("; cleanup failed: {error}"))
            .unwrap_or_default();
        let diagnostic = helper_diagnostic(output);
        let diagnostic = (!diagnostic.is_empty())
            .then(|| format!("; diagnostic: {diagnostic}"))
            .unwrap_or_default();
        format!(
            "Windows shortcut helper timed out after {} seconds{status}{cleanup}{diagnostic}",
            POWERSHELL_TIMEOUT.as_secs()
        )
    }

    fn helper_diagnostic(output: &BoundedOutput) -> String {
        let (bytes, truncated) = if output.stderr.is_empty() {
            (&output.stdout, output.stdout_truncated)
        } else {
            (&output.stderr, output.stderr_truncated)
        };
        let mut diagnostic = String::from_utf8_lossy(bytes).trim().to_string();
        if truncated {
            diagnostic.push_str(" [output truncated]");
        }
        diagnostic
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::sync::{Mutex, MutexGuard};

        static TEST_MUTEX: Mutex<()> = Mutex::new(());

        struct Fixture {
            root: PathBuf,
            _guard: MutexGuard<'static, ()>,
        }

        impl Fixture {
            fn new(name: &str) -> Self {
                let guard = TEST_MUTEX.lock().unwrap();
                let root = std::env::temp_dir().join(format!(
                    "sco-shortcut-{name}-{}-{}",
                    std::process::id(),
                    SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_nanos()
                ));
                fs::create_dir(&root).unwrap();
                Self {
                    root,
                    _guard: guard,
                }
            }

            fn target(&self, name: &str) -> PathBuf {
                let target = self.root.join(name);
                fs::write(&target, b"fixture executable").unwrap();
                target
            }
        }

        impl Drop for Fixture {
            fn drop(&mut self) {
                let _ = fs::remove_dir_all(&self.root);
            }
        }

        #[test]
        fn creates_reads_and_keeps_an_unchanged_shortcut() {
            let fixture = Fixture::new("create");
            let target = fixture.target("SC2 Coop 中文 🧪.exe");
            let link = fixture.root.join("SC2 Coop Info.lnk");
            assert_eq!(
                create_or_update_at(&target, &link),
                Ok(ShortcutUpdate::Created(link.clone()))
            );
            assert!(read_fields(&link)
                .unwrap()
                .matches(&ShortcutFields::for_target(&target).unwrap()));
            assert_eq!(
                create_or_update_at(&target, &link),
                Ok(ShortcutUpdate::Unchanged(link))
            );
        }

        #[test]
        fn replacement_preserves_existing_and_prior_backups() {
            let fixture = Fixture::new("replace");
            let old_target = fixture.target("old.exe");
            let new_target = fixture.target("new.exe");
            let link = fixture.root.join("SC2 Coop Info.lnk");
            let prior_backup = fixture.root.join("SC2 Coop Info.previous.lnk");
            fs::write(&prior_backup, b"older backup").unwrap();
            write_shortcut(&ShortcutFields::for_target(&old_target).unwrap(), &link).unwrap();

            let ShortcutUpdate::Replaced { backup, .. } =
                create_or_update_at(&new_target, &link).unwrap()
            else {
                panic!("expected replacement")
            };
            assert_eq!(fs::read(&prior_backup).unwrap(), b"older backup");
            assert_ne!(backup, prior_backup);
            assert!(read_fields(&backup)
                .unwrap()
                .matches(&ShortcutFields::for_target(&old_target).unwrap()));
            assert!(read_fields(&link)
                .unwrap()
                .matches(&ShortcutFields::for_target(&new_target).unwrap()));
        }

        #[test]
        fn missing_target_does_not_modify_an_existing_shortcut() {
            let fixture = Fixture::new("missing");
            let old_target = fixture.target("old.exe");
            let link = fixture.root.join("SC2 Coop Info.lnk");
            write_shortcut(&ShortcutFields::for_target(&old_target).unwrap(), &link).unwrap();
            let before = fs::read(&link).unwrap();
            assert!(create_or_update_at(&fixture.root.join("missing.exe"), &link).is_err());
            assert_eq!(fs::read(link).unwrap(), before);
        }

        #[test]
        fn unreadable_existing_shortcut_is_left_unchanged() {
            let fixture = Fixture::new("invalid-existing");
            let target = fixture.target("new.exe");
            let link = fixture.root.join("SC2 Coop Info.lnk");
            fs::write(&link, b"not a shell link").unwrap();
            let before = fs::read(&link).unwrap();
            assert!(create_or_update_at(&target, &link)
                .unwrap_err()
                .contains("left unchanged"));
            assert_eq!(fs::read(link).unwrap(), before);
        }

        #[test]
        fn strips_windows_verbatim_prefix_before_shell_handoff() {
            assert_eq!(
                strip_verbatim_prefix(PathBuf::from(r"\\?\C:\Portable\SC2.exe")),
                PathBuf::from(r"C:\Portable\SC2.exe")
            );
            assert_eq!(
                strip_verbatim_prefix(PathBuf::from(r"\\?\UNC\server\share\SC2.exe")),
                PathBuf::from(r"\\server\share\SC2.exe")
            );
        }

        #[test]
        fn temp_and_debug_targets_are_rejected_by_public_policy() {
            let fixture = Fixture::new("policy");
            let temp_target = fixture.target("temporary.exe");
            assert!(validate_target(&temp_target)
                .unwrap_err()
                .contains("temporary executable"));
            let debug_root = fixture.root.join("target").join("debug");
            fs::create_dir_all(&debug_root).unwrap();
            let debug_target = debug_root.join("development.exe");
            fs::write(&debug_target, b"debug executable").unwrap();
            assert!(validate_target(&debug_target)
                .unwrap_err()
                .contains("build-output executable"));
        }
    }
}

#[cfg(windows)]
pub use windows_shortcut::create_or_update;

#[cfg(not(windows))]
pub fn create_or_update() -> Result<ShortcutUpdate, String> {
    Err("Create desktop shortcut is not available in this build".into())
}

#[cfg(all(test, not(windows)))]
mod non_windows_tests {
    #[test]
    fn desktop_shortcut_is_explicitly_unavailable() {
        assert_eq!(
            super::create_or_update().unwrap_err(),
            "Create desktop shortcut is not available in this build"
        );
    }
}
