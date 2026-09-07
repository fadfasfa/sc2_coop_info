//! Independent packaging-only regressions. Included under portable_runtime::qa_tests.
use std::{fs, path::PathBuf};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!("sco-portable-qa-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        // Delete only this test's uniquely-created temporary fixture.
        assert!(self.0.file_name().unwrap().to_string_lossy().starts_with("sco-portable-qa-"));
        assert!(self.0.is_absolute());
        assert_eq!(self.0.parent().unwrap().canonicalize().unwrap(), std::env::temp_dir().canonicalize().unwrap());
        assert!(!fs::symlink_metadata(&self.0).unwrap().file_type().is_symlink());
        fs::remove_dir_all(&self.0).unwrap();
    }
}

#[cfg(windows)]
#[test]
fn acl_denied_profile_write_fails_without_any_fallback_or_private_data_mutation() {
    struct DeniedWrite { path: PathBuf, sid: String }
    impl Drop for DeniedWrite {
        fn drop(&mut self) {
            assert_eq!(self.path.file_name().unwrap(), "profile");
            assert!(self.path.parent().unwrap().file_name().unwrap().to_string_lossy().starts_with("sco-portable-qa-"));
            let restored = std::process::Command::new("icacls").arg(&self.path).arg("/remove:d").arg(format!("*{}", self.sid)).arg("/T").output().unwrap();
            assert!(restored.status.success(), "Failed to restore this fixture's ACL: {}", String::from_utf8_lossy(&restored.stderr));
        }
    }
    let fixture = Fixture::new();
    let profile = fixture.0.join("profile");
    fs::create_dir(&profile).unwrap();
    for name in ["Accounts", "screenshots", "generated", "webview"] { fs::create_dir(profile.join(name)).unwrap(); }
    let sentinel = fixture.0.join("original-appdata-sentinel.json");
    fs::write(&sentinel, "private synthetic data").unwrap();
    let identity = std::process::Command::new("whoami").args(["/user", "/fo", "csv", "/nh"]).output().unwrap();
    assert!(identity.status.success());
    let identity = String::from_utf8(identity.stdout).unwrap();
    let sid = identity.split('"').find(|field| field.starts_with("S-1-")).expect("Current user SID").to_string();
    let deny = std::process::Command::new("icacls").arg(&profile).arg("/deny").arg(format!("*{}:(OI)(CI)(W)", sid)).output().unwrap();
    let guard = DeniedWrite { path: profile.clone(), sid };
    assert!(deny.status.success(), "{}", String::from_utf8_lossy(&deny.stderr));
    assert!(fs::write(profile.join("must-not-write"), "probe").is_err(), "The ACL fixture must really deny writes");
    let error = super::prepare_at(&fixture.0).unwrap_err();
    assert!(error.contains("not writable"), "Expected the actual write probe to fail: {error}");
    assert!(!profile.join("must-not-write").exists());
    assert_eq!(fs::read_to_string(&sentinel).unwrap(), "private synthetic data");
    assert_eq!(fs::read_dir(profile.join("Accounts")).unwrap().count(), 0);
    drop(guard);
    fs::write(profile.join("restored-write-probe"), "restored").unwrap();
}

#[test]
fn files_and_unusable_children_fail_closed_without_modifying_existing_content() {
    let fixture = Fixture::new();
    let blocker = fixture.0.join("profile");
    fs::write(&blocker, "private sentinel").unwrap();
    assert!(super::checked_directory(&blocker).is_err());
    assert!(super::checked_directory(&blocker.join("Accounts")).is_err());
    assert_eq!(fs::read_to_string(blocker).unwrap(), "private sentinel");
}

#[test]
fn fresh_profile_directories_are_empty_and_do_not_import_adjacent_private_data() {
    let fixture = Fixture::new();
    let private = fixture.0.join("upstream-profile");
    fs::create_dir(&private).unwrap();
    fs::write(private.join("settings.json"), r#"{"player_notes":{"x":"private sentinel"}}"#).unwrap();
    let profile = fixture.0.join("profile");
    assert_eq!(super::prepare_at(&fixture.0).unwrap(), profile);
    for name in ["Accounts", "screenshots", "generated", "webview"] {
        let child = profile.join(name);
        assert!(child.is_dir());
        assert_eq!(fs::read_dir(child).unwrap().count(), 0);
    }
    assert_eq!(fs::read_dir(&profile).unwrap().count(), 4, "No imported settings or leftover write probe");
    assert!(!profile.join("settings.json").exists());
    assert_eq!(fs::read_to_string(private.join("settings.json")).unwrap(), r#"{"player_notes":{"x":"private sentinel"}}"#);
}

#[test]
fn override_cannot_redirect_webview_to_an_external_profile() {
    // A subprocess avoids changing environment or OnceLock state in parallel tests.
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "portable_runtime::qa_tests::override_rejection_subprocess_entry", "--nocapture"])
        .env("SCO_PORTABLE_QA_OVERRIDE_CHILD", "1")
        .env("WEBVIEW2_USER_DATA_FOLDER", "synthetic-forbidden-external-profile")
        .output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    assert!(String::from_utf8_lossy(&output.stdout).contains("PORTABLE_OVERRIDE_REJECTED"));
}

#[test]
fn override_rejection_subprocess_entry() {
    if std::env::var_os("SCO_PORTABLE_QA_OVERRIDE_CHILD").is_none() { return; }
    let error = super::initialize().unwrap_err();
    assert!(error.contains("WEBVIEW2_USER_DATA_FOLDER"));
    println!("PORTABLE_OVERRIDE_REJECTED");
}

#[cfg(windows)]
#[test]
fn windows_junction_is_rejected_without_touching_target() {
    let fixture = Fixture::new();
    let target = fixture.0.join("target");
    let link = fixture.0.join("junction");
    fs::create_dir(&target).unwrap();
    fs::write(target.join("sentinel"), "unchanged").unwrap();
    let output = std::process::Command::new("cmd").args(["/c", "mklink", "/J"]).arg(&link).arg(&target).output().unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    assert!(super::checked_directory(&link).is_err());
    assert_eq!(fs::read_to_string(target.join("sentinel")).unwrap(), "unchanged");
    // remove_dir on the exact junction removes the link, not its target.
    fs::remove_dir(&link).unwrap();
    assert!(target.join("sentinel").exists());
}

#[cfg(unix)]
#[test]
fn unix_symlink_is_rejected_without_touching_target() {
    let fixture = Fixture::new();
    let target = fixture.0.join("target");
    let link = fixture.0.join("link");
    fs::create_dir(&target).unwrap();
    std::os::unix::fs::symlink(&target, &link).unwrap();
    assert!(super::checked_directory(&link).is_err());
    fs::remove_file(&link).unwrap();
    assert!(target.is_dir());
}
