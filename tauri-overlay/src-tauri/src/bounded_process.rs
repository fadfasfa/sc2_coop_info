use std::{
    io::{self, Read},
    process::{Command, ExitStatus, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

#[derive(Debug)]
pub(crate) struct BoundedOutput {
    pub(crate) status: Option<ExitStatus>,
    pub(crate) stdout: Vec<u8>,
    pub(crate) stderr: Vec<u8>,
    pub(crate) stdout_truncated: bool,
    pub(crate) stderr_truncated: bool,
    pub(crate) timed_out: bool,
    pub(crate) cleanup_confirmed: bool,
    pub(crate) cleanup_error: Option<String>,
}

#[derive(Debug)]
struct CapturedStream {
    bytes: Vec<u8>,
    truncated: bool,
}

const PIPE_DRAIN_GRACE: Duration = Duration::from_secs(2);
const TERMINATION_GRACE: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Copy)]
enum StreamName {
    Stdout,
    Stderr,
}

/// Runs a child to a fixed deadline while continuously draining both pipes.
///
/// Pipe readers retain at most output_limit bytes each, but continue reading
/// after that limit so a noisy child cannot deadlock on a full pipe.
pub(crate) fn run_bounded(
    command: &mut Command,
    timeout: Duration,
    output_limit: usize,
) -> io::Result<BoundedOutput> {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn()?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (Some(stdout), Some(stderr)) = (stdout, stderr) else {
        let mut cleanup_errors = vec!["child output pipes were not created".to_string()];
        let status = terminate_and_reap(&mut child, &mut cleanup_errors);
        let cleanup_confirmed = status.is_some();
        return Ok(BoundedOutput {
            status,
            stdout: Vec::new(),
            stderr: Vec::new(),
            stdout_truncated: false,
            stderr_truncated: false,
            timed_out: false,
            cleanup_confirmed,
            cleanup_error: Some(cleanup_errors.join("; ")),
        });
    };
    let (reader_sender, reader_receiver) = mpsc::channel();
    let stdout_sender = reader_sender.clone();
    if let Err(error) = thread::Builder::new()
        .name("bounded-stdout-drainer".to_string())
        .spawn(move || {
            let _ = stdout_sender.send((StreamName::Stdout, drain_bounded(stdout, output_limit)));
        })
    {
        return Ok(output_after_setup_failure(
            &mut child,
            format!("cannot start child stdout drainer: {error}"),
        ));
    }
    if let Err(error) = thread::Builder::new()
        .name("bounded-stderr-drainer".to_string())
        .spawn(move || {
            let _ = reader_sender.send((StreamName::Stderr, drain_bounded(stderr, output_limit)));
        })
    {
        return Ok(output_after_setup_failure(
            &mut child,
            format!("cannot start child stderr drainer: {error}"),
        ));
    }

    let started = Instant::now();
    let mut timed_out = false;
    let mut cleanup_confirmed = false;
    let mut cleanup_errors = Vec::new();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                cleanup_confirmed = true;
                break Some(status);
            }
            Ok(None) if started.elapsed() < timeout => {
                thread::sleep(
                    Duration::from_millis(10).min(timeout.saturating_sub(started.elapsed())),
                );
            }
            Ok(None) => {
                timed_out = true;
                let status = terminate_and_reap(&mut child, &mut cleanup_errors);
                cleanup_confirmed = status.is_some();
                break status;
            }
            Err(error) => {
                cleanup_errors.push(format!("cannot query child status: {error}"));
                let status = terminate_and_reap(&mut child, &mut cleanup_errors);
                cleanup_confirmed = status.is_some();
                break status;
            }
        }
    };

    // Only collect after confirmed child exit. The drain grace has its own
    // deadline because a descendant can inherit a pipe even after this direct
    // child has been reaped. In that case the reader remains detached and the
    // transaction still returns in bounded time.
    let (stdout, stderr) = if cleanup_confirmed {
        let errors_before_drain = cleanup_errors.len();
        let streams = collect_readers(reader_receiver, &mut cleanup_errors);
        if cleanup_errors.len() != errors_before_drain {
            cleanup_confirmed = false;
        }
        streams
    } else {
        (
            CapturedStream {
                bytes: Vec::new(),
                truncated: false,
            },
            CapturedStream {
                bytes: Vec::new(),
                truncated: false,
            },
        )
    };
    Ok(BoundedOutput {
        status,
        stdout: stdout.bytes,
        stderr: stderr.bytes,
        stdout_truncated: stdout.truncated,
        stderr_truncated: stderr.truncated,
        timed_out,
        cleanup_confirmed,
        cleanup_error: (!cleanup_errors.is_empty()).then(|| cleanup_errors.join("; ")),
    })
}

fn output_after_setup_failure(
    child: &mut std::process::Child,
    setup_error: String,
) -> BoundedOutput {
    let mut cleanup_errors = vec![setup_error];
    let status = terminate_and_reap(child, &mut cleanup_errors);
    let cleanup_confirmed = status.is_some();
    BoundedOutput {
        status,
        stdout: Vec::new(),
        stderr: Vec::new(),
        stdout_truncated: false,
        stderr_truncated: false,
        timed_out: false,
        cleanup_confirmed,
        cleanup_error: Some(cleanup_errors.join("; ")),
    }
}

fn terminate_and_reap(
    child: &mut std::process::Child,
    cleanup_errors: &mut Vec<String>,
) -> Option<ExitStatus> {
    if let Err(error) = child.kill() {
        cleanup_errors.push(format!("cannot terminate child: {error}"));
    }
    let deadline = Instant::now() + TERMINATION_GRACE;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Some(status),
            Ok(None) => {
                let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
                    cleanup_errors.push(
                        "child termination was not confirmed before cleanup deadline".to_string(),
                    );
                    return None;
                };
                thread::sleep(Duration::from_millis(10).min(remaining));
            }
            Err(error) => {
                cleanup_errors.push(format!("cannot reap child: {error}"));
                return None;
            }
        }
    }
}

fn drain_bounded(mut reader: impl Read, output_limit: usize) -> io::Result<CapturedStream> {
    let mut bytes = Vec::with_capacity(output_limit.min(8 * 1024));
    let mut buffer = [0_u8; 8 * 1024];
    let mut truncated = false;
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        let retained = output_limit.saturating_sub(bytes.len()).min(count);
        bytes.extend_from_slice(&buffer[..retained]);
        truncated |= retained < count;
    }
    Ok(CapturedStream { bytes, truncated })
}

fn collect_readers(
    receiver: mpsc::Receiver<(StreamName, io::Result<CapturedStream>)>,
    cleanup_errors: &mut Vec<String>,
) -> (CapturedStream, CapturedStream) {
    let deadline = Instant::now() + PIPE_DRAIN_GRACE;
    let mut stdout = None;
    let mut stderr = None;
    while stdout.is_none() || stderr.is_none() {
        let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
            cleanup_errors.push("timed out draining child output pipes".to_string());
            break;
        };
        match receiver.recv_timeout(remaining) {
            Ok((name, Ok(output))) => match name {
                StreamName::Stdout => stdout = Some(output),
                StreamName::Stderr => stderr = Some(output),
            },
            Ok((name, Err(error))) => {
                let name = match name {
                    StreamName::Stdout => "stdout",
                    StreamName::Stderr => "stderr",
                };
                cleanup_errors.push(format!("cannot drain child {name}: {error}"));
                match name {
                    "stdout" => {
                        stdout = Some(CapturedStream {
                            bytes: Vec::new(),
                            truncated: false,
                        })
                    }
                    _ => {
                        stderr = Some(CapturedStream {
                            bytes: Vec::new(),
                            truncated: false,
                        })
                    }
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                cleanup_errors.push("timed out draining child output pipes".to_string());
                break;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                cleanup_errors.push("child output drainers disconnected".to_string());
                break;
            }
        }
    }
    (stdout.unwrap_or_else(empty_stream), stderr.unwrap_or_else(empty_stream))
}

fn empty_stream() -> CapturedStream {
    CapturedStream {
        bytes: Vec::new(),
        truncated: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    const CHILD_MODE: &str = "SCO_BOUNDED_PROCESS_TEST_CHILD";

    fn child_command(mode: &str) -> Command {
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args(["--nocapture", "bounded_process_child_behavior"])
            .env(CHILD_MODE, mode);
        command
    }

    #[test]
    fn bounded_process_child_behavior() {
        match std::env::var(CHILD_MODE).as_deref() {
            Ok("success") => {
                println!("successful helper");
                eprintln!("successful diagnostic");
            }
            Ok("flood") => {
                std::io::stdout().write_all(&vec![b'o'; 2 * 1024 * 1024]).unwrap();
                std::io::stderr().write_all(&vec![b'e'; 2 * 1024 * 1024]).unwrap();
            }
            Ok("hang") => thread::sleep(Duration::from_secs(5)),
            Ok("inherited_pipe_parent") => {
                child_command("inherited_pipe_descendant").spawn().unwrap();
            }
            Ok("inherited_pipe_descendant") => thread::sleep(Duration::from_secs(3)),
            _ => {}
        }
    }

    #[test]
    fn successful_helper_is_captured() {
        let output = run_bounded(
            &mut child_command("success"),
            Duration::from_secs(2),
            64 * 1024,
        )
        .unwrap();
        assert!(!output.timed_out);
        assert!(output.cleanup_confirmed);
        assert!(output.status.is_some_and(|status| status.success()));
        assert!(String::from_utf8_lossy(&output.stdout).contains("successful helper"));
        assert!(String::from_utf8_lossy(&output.stderr).contains("successful diagnostic"));
        assert!(output.cleanup_error.is_none());
    }

    #[test]
    fn output_flood_is_drained_but_bounded() {
        let output = run_bounded(
            &mut child_command("flood"),
            Duration::from_secs(5),
            32 * 1024,
        )
        .unwrap();
        assert!(!output.timed_out);
        assert!(output.cleanup_confirmed);
        assert!(output.status.is_some_and(|status| status.success()));
        assert_eq!(output.stdout.len(), 32 * 1024);
        assert_eq!(output.stderr.len(), 32 * 1024);
        assert!(output.stdout_truncated);
        assert!(output.stderr_truncated);
        assert!(output.cleanup_error.is_none());
    }

    #[test]
    fn hanging_helper_is_terminated_and_reaped_at_deadline() {
        let started = Instant::now();
        let output = run_bounded(
            &mut child_command("hang"),
            Duration::from_millis(150),
            32 * 1024,
        )
        .unwrap();
        assert!(output.timed_out);
        assert!(output.cleanup_confirmed);
        assert!(output.status.is_some());
        assert!(started.elapsed() < Duration::from_secs(3));
        assert!(output.cleanup_error.is_none());
    }

    #[test]
    fn inherited_pipe_from_descendant_does_not_block_cleanup() {
        let started = Instant::now();
        let output = run_bounded(
            &mut child_command("inherited_pipe_parent"),
            Duration::from_secs(2),
            32 * 1024,
        )
        .unwrap();
        assert!(!output.timed_out);
        assert!(output.status.is_some_and(|status| status.success()));
        assert!(!output.cleanup_confirmed);
        assert!(output
            .cleanup_error
            .as_deref()
            .is_some_and(|error| error.contains("timed out draining child output pipes")));
        assert!(started.elapsed() < Duration::from_secs(4));
    }
}
