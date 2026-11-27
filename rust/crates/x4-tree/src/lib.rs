use memmap2::Mmap;
use rayon::prelude::*;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const EMPTY_SHA256: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const MMAP_THRESHOLD: u64 = 65_536;
const STREAM_CHUNK_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Default)]
pub struct HashTreeOptions {
    pub check_utf8: bool,
    pub allow_missing_root: bool,
    pub max_entries: Option<usize>,
    pub max_bytes: Option<u64>,
    pub exclude_dirs: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TreeEntryKind {
    File,
    Directory,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    pub path: String,
    pub kind: TreeEntryKind,
    pub size: u64,
    pub mtime_ms: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub utf8: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HashTreeReport {
    pub ok: bool,
    pub missing: bool,
    pub total_bytes: u64,
    pub entries: Vec<TreeEntry>,
}

#[derive(Debug)]
pub enum TreeError {
    SymlinkOrSpecial(String),
    MissingRoot(String),
    LimitExceeded(String),
    Io(String),
}

impl TreeError {
    pub fn exit_code(&self) -> i32 {
        match self {
            Self::SymlinkOrSpecial(_) => 3,
            Self::MissingRoot(_) | Self::LimitExceeded(_) | Self::Io(_) => 2,
        }
    }
}

impl std::fmt::Display for TreeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SymlinkOrSpecial(msg)
            | Self::MissingRoot(msg)
            | Self::LimitExceeded(msg)
            | Self::Io(msg) => f.write_str(msg),
        }
    }
}

impl std::error::Error for TreeError {}

struct PendingEntry {
    rel_path: String,
    abs_path: PathBuf,
    kind: TreeEntryKind,
    size: u64,
    mtime_ms: f64,
}

fn modified_ms(meta: &fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

fn hash_file_streaming(file: &File, check_utf8: bool) -> Result<(String, Option<bool>), TreeError> {
    let mut reader = BufReader::with_capacity(STREAM_CHUNK_BYTES, file);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; STREAM_CHUNK_BYTES];
    let mut raw_for_utf8: Vec<u8> = Vec::new();
    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| TreeError::Io(format!("read failed: {e}")))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        if check_utf8 {
            raw_for_utf8.extend_from_slice(&buf[..n]);
        }
    }
    let sha = hex::encode(hasher.finalize());
    let utf8 = if check_utf8 {
        Some(std::str::from_utf8(&raw_for_utf8).is_ok())
    } else {
        None
    };
    Ok((sha, utf8))
}

pub fn hash_regular_file(
    abs_path: &Path,
    size: u64,
    check_utf8: bool,
) -> Result<(String, Option<bool>), TreeError> {
    if size == 0 {
        return Ok((EMPTY_SHA256.to_string(), if check_utf8 { Some(true) } else { None }));
    }
    if size < MMAP_THRESHOLD {
        let bytes = fs::read(abs_path)
            .map_err(|e| TreeError::Io(format!("read {}: {e}", abs_path.display())))?;
        let sha = hex::encode(Sha256::digest(&bytes));
        let utf8 = if check_utf8 {
            Some(std::str::from_utf8(&bytes).is_ok())
        } else {
            None
        };
        return Ok((sha, utf8));
    }

    let file = File::open(abs_path)
        .map_err(|e| TreeError::Io(format!("open {}: {e}", abs_path.display())))?;
    // SAFETY: The file is opened read-only and verified regular before hashing; mmap failure falls back cleanly.
    if let Ok(mmap) = unsafe { Mmap::map(&file) } {
        let bytes: &[u8] = &mmap;
        let sha = hex::encode(Sha256::digest(bytes));
        let utf8 = if check_utf8 {
            Some(std::str::from_utf8(bytes).is_ok())
        } else {
            None
        };
        return Ok((sha, utf8));
    }

    drop(file);
    let reopened = File::open(abs_path)
        .map_err(|e| TreeError::Io(format!("reopen {}: {e}", abs_path.display())))?;
    hash_file_streaming(&reopened, check_utf8)
}

fn collect_entries(
    dir: &Path,
    rel_prefix: &str,
    opts: &HashTreeOptions,
    out: &mut Vec<PendingEntry>,
    total_bytes: &mut u64,
) -> Result<(), TreeError> {
    let read_dir = fs::read_dir(dir)
        .map_err(|e| TreeError::Io(format!("readdir {}: {e}", dir.display())))?;
    let mut children: Vec<(String, String, PathBuf)> = Vec::new();
    for item in read_dir {
        let entry = item.map_err(|e| TreeError::Io(format!("dirent {}: {e}", dir.display())))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let rel = if rel_prefix.is_empty() {
            name.clone()
        } else {
            format!("{rel_prefix}/{name}")
        };
        children.push((name, rel, entry.path()));
    }
    children.sort_by(|a, b| a.1.cmp(&b.1));

    for (name, rel, abs) in children {
        if let Some(max_entries) = opts.max_entries {
            if out.len() >= max_entries {
                return Err(TreeError::LimitExceeded(format!(
                    "Deployment observation exceeds entry limit ({max_entries})."
                )));
            }
        }
        let meta = fs::symlink_metadata(&abs)
            .map_err(|e| TreeError::Io(format!("lstat {rel}: {e}")))?;
        let ftype = meta.file_type();
        if ftype.is_symlink() {
            return Err(TreeError::SymlinkOrSpecial(format!(
                "Refusing symbolic link or reparse point in tree: {rel}"
            )));
        }
        if ftype.is_dir() {
            if opts
                .exclude_dirs
                .iter()
                .any(|d| d.eq_ignore_ascii_case(&name))
            {
                continue;
            }
            out.push(PendingEntry {
                rel_path: rel.clone(),
                abs_path: abs.clone(),
                kind: TreeEntryKind::Directory,
                size: 0,
                mtime_ms: modified_ms(&meta),
            });
            collect_entries(&abs, &rel, opts, out, total_bytes)?;
        } else if ftype.is_file() {
            let size = meta.len();
            *total_bytes = total_bytes.saturating_add(size);
            if let Some(max_bytes) = opts.max_bytes {
                if *total_bytes > max_bytes {
                    return Err(TreeError::LimitExceeded(format!(
                        "Tree total bytes exceed limit ({max_bytes})."
                    )));
                }
            }
            out.push(PendingEntry {
                rel_path: rel,
                abs_path: abs,
                kind: TreeEntryKind::File,
                size,
                mtime_ms: modified_ms(&meta),
            });
        } else {
            return Err(TreeError::SymlinkOrSpecial(format!(
                "Refusing unsupported filesystem entry type in tree: {rel}"
            )));
        }
    }
    Ok(())
}

pub fn hash_tree(root: &Path, opts: HashTreeOptions) -> Result<HashTreeReport, TreeError> {
    let root_meta = match fs::symlink_metadata(root) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            if opts.allow_missing_root {
                return Ok(HashTreeReport {
                    ok: true,
                    missing: true,
                    total_bytes: 0,
                    entries: Vec::new(),
                });
            }
            return Err(TreeError::MissingRoot(format!(
                "Target root does not exist: {}",
                root.display()
            )));
        }
        Err(e) => return Err(TreeError::Io(format!("lstat {}: {e}", root.display()))),
    };

    let ftype = root_meta.file_type();
    if ftype.is_symlink() {
        return Err(TreeError::SymlinkOrSpecial(format!(
            "Refusing symbolic link or reparse point root: {}",
            root.display()
        )));
    }
    if !ftype.is_dir() {
        return Err(TreeError::SymlinkOrSpecial(format!(
            "Target root is not a physical directory: {}",
            root.display()
        )));
    }

    let mut pending = Vec::new();
    let mut total_bytes: u64 = 0;
    collect_entries(root, "", &opts, &mut pending, &mut total_bytes)?;

    let entries: Result<Vec<TreeEntry>, TreeError> = pending
        .into_par_iter()
        .map(|item| match item.kind {
            TreeEntryKind::Directory => Ok(TreeEntry {
                path: item.rel_path,
                kind: TreeEntryKind::Directory,
                size: 0,
                mtime_ms: item.mtime_ms,
                sha256: None,
                utf8: None,
            }),
            TreeEntryKind::File => {
                let (sha256, utf8) = hash_regular_file(&item.abs_path, item.size, opts.check_utf8)?;
                Ok(TreeEntry {
                    path: item.rel_path,
                    kind: TreeEntryKind::File,
                    size: item.size,
                    mtime_ms: item.mtime_ms,
                    sha256: Some(sha256),
                    utf8,
                })
            }
        })
        .collect();

    Ok(HashTreeReport {
        ok: true,
        missing: false,
        total_bytes,
        entries: entries?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("x4_tree_test_{label}_{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn hashes_zero_small_large_and_invalid_utf8_files() {
        let root = temp_dir("mixed");
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(root.join("empty.txt"), b"").unwrap();
        fs::write(root.join("nested/hello.xml"), b"<root>hi</root>").unwrap();
        fs::write(root.join("large.bin"), vec![0x41u8; 131_072]).unwrap();
        fs::write(root.join("bad_utf8.bin"), [0xff, 0xfe, 0x80]).unwrap();

        let report = hash_tree(
            &root,
            HashTreeOptions {
                check_utf8: true,
                allow_missing_root: false,
                max_entries: None,
                max_bytes: None,
                exclude_dirs: Vec::new(),
            },
        )
        .unwrap();

        assert!(report.ok);
        assert!(!report.missing);
        assert_eq!(report.total_bytes, 15 + 131_072 + 3);

        let empty = report.entries.iter().find(|e| e.path == "empty.txt").unwrap();
        assert_eq!(empty.sha256.as_deref(), Some(EMPTY_SHA256));
        assert_eq!(empty.utf8, Some(true));

        let bad = report.entries.iter().find(|e| e.path == "bad_utf8.bin").unwrap();
        assert_eq!(bad.utf8, Some(false));

        let large = report.entries.iter().find(|e| e.path == "large.bin").unwrap();
        assert_eq!(large.size, 131_072);
        assert_eq!(large.utf8, Some(true));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn missing_root_honors_allow_missing_flag() {
        let missing = std::env::temp_dir().join("x4_tree_definitely_missing_xyz_9981");
        let err = hash_tree(&missing, HashTreeOptions::default()).unwrap_err();
        assert_eq!(err.exit_code(), 2);

        let ok = hash_tree(
            &missing,
            HashTreeOptions {
                allow_missing_root: true,
                ..Default::default()
            },
        )
        .unwrap();
        assert!(ok.missing);
        assert!(ok.entries.is_empty());
    }

    #[test]
    fn exclude_dirs_skips_nested_files_and_refuses_symlink_at_excluded_dir() {
        let root = temp_dir("excluded");
        let git_dir = root.join(".git");
        let nm_bin = root.join("node_modules/.bin");
        fs::create_dir_all(&git_dir).unwrap();
        fs::create_dir_all(&nm_bin).unwrap();
        fs::write(git_dir.join("HEAD"), b"ref: refs/heads/main\n").unwrap();
        fs::write(nm_bin.join("tool"), b"bin").unwrap();
        fs::write(root.join("content.xml"), b"<content id=\"ok\"/>").unwrap();

        let report = hash_tree(
            &root,
            HashTreeOptions {
                exclude_dirs: vec![".git".to_string(), "node_modules".to_string()],
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(report.entries.len(), 1);
        assert_eq!(report.entries[0].path, "content.xml");

        // Replace `.git` dir with a symlink/junction pointing elsewhere -> must refuse BEFORE exclude check.
        let target_dir = root.join("_target");
        fs::create_dir_all(&target_dir).unwrap();
        fs::remove_dir_all(&git_dir).unwrap();
        #[cfg(windows)]
        let linked = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&git_dir)
            .arg(&target_dir)
            .output()
            .is_ok_and(|o| o.status.success());
        #[cfg(unix)]
        let linked = std::os::unix::fs::symlink(&target_dir, &git_dir).is_ok();
        if linked {
            let err = hash_tree(
                &root,
                HashTreeOptions {
                    exclude_dirs: vec![".git".to_string()],
                    ..Default::default()
                },
            )
            .unwrap_err();
            assert_eq!(err.exit_code(), 3);
        }
        let _ = fs::remove_dir_all(&root);
    }
}
