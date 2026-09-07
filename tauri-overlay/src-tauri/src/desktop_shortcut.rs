use std::path::{Path, PathBuf};

#[cfg(windows)]
pub fn create_or_update() -> Result<PathBuf, String> {
    let target = std::env::current_exe().map_err(|e| format!("cannot resolve executable: {e}"))?;
    if !target.is_file() { return Err(format!("executable does not exist: {}", target.display())); }
    let desktop = std::env::var_os("USERPROFILE").map(PathBuf::from).map(|p| p.join("Desktop")).ok_or_else(|| "cannot resolve desktop directory".to_string())?;
    let link = desktop.join("SC2 Coop Info.lnk");
    let temp = link.with_extension("lnk.tmp");
    let script = "$s=New-Object -ComObject WScript.Shell;$l=$s.CreateShortcut($args[1]);$l.TargetPath=$args[0];$l.WorkingDirectory=(Split-Path $args[0]);$l.IconLocation=$args[0]+',0';$l.Save()";
    let status = std::process::Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-Command",script,target.to_string_lossy().as_ref(),temp.to_string_lossy().as_ref()]).status().map_err(|e| format!("start shortcut writer: {e}"))?;
    if !status.success() || !temp.is_file() { let _=std::fs::remove_file(&temp); return Err("Windows shortcut writer failed".into()); }
    if link.exists() { let _=std::fs::copy(&link, link.with_extension("lnk.previous")); }
    std::fs::rename(&temp, &link).map_err(|e| format!("replace shortcut: {e}"))?;
    Ok(link)
}

#[cfg(not(windows))]
pub fn create_or_update() -> Result<PathBuf, String> { Err("Create desktop shortcut is only available on Windows".into()) }
