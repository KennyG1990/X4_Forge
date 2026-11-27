use base64::{engine::general_purpose::STANDARD as BASE64_STD, Engine as _};
use md5::{Digest as Md5Digest, Md5};
use rayon::prelude::*;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

pub const MAX_CAT_MANIFEST_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_CAT_ENTRIES: usize = 1_000_000;
const MAX_EXTENSION_CATALOG_PARTS: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatEntry {
    pub name: String,
    pub size: u64,
    pub offset: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub md5: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CatalogPair {
    pub cat: String,
    pub dat: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackInputEntry {
    pub name: String,
    pub size: u64,
    #[serde(default)]
    pub source_path: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub content_base64: Option<String>,
    #[serde(default)]
    pub expected_sha256: Option<String>,
    #[serde(default)]
    pub timestamp: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackLayoutVolume {
    pub index: u32,
    pub cat_name: String,
    pub dat_name: String,
    pub cat_bytes: u64,
    #[serde(default)]
    pub dat_bytes: u64,
    pub entries: Vec<PackInputEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackLayoutInput {
    pub volumes: Vec<PackLayoutVolume>,
    #[serde(default)]
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackedEntryReceipt {
    pub name: String,
    pub size: u64,
    pub md5: String,
    pub sha256: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackedVolumeReceipt {
    pub index: u32,
    pub cat_path: String,
    pub dat_path: String,
    pub bytes: u64,
    pub entries: Vec<PackedEntryReceipt>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatDatPackResult {
    pub ok: bool,
    pub volumes: Vec<PackedVolumeReceipt>,
    pub errors: Vec<String>,
}

pub fn safe_catalog_name(input: &str) -> Option<String> {
    let replaced = input.replace('\\', "/");
    let normalized = replaced.trim_start_matches('/');
    if normalized.is_empty()
        || normalized.contains('\0')
        || normalized.contains('\r')
        || normalized.contains('\n')
    {
        return None;
    }
    let bytes = normalized.as_bytes();
    if bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'/' {
        return None;
    }
    let parts: Vec<&str> = normalized.split('/').collect();
    if parts.iter().any(|p| p.is_empty() || *p == "." || *p == "..") {
        return None;
    }
    Some(parts.join("/"))
}

pub fn parse_cat_manifest(
    text: &str,
    max_entries: usize,
    strict: bool,
    source_path: &str,
) -> Result<Vec<CatEntry>, String> {
    let loc = if source_path.is_empty() {
        String::new()
    } else {
        format!(": {source_path}")
    };
    let strict_re = if strict {
        Some(Regex::new(r"(?i)^.+ \d+ \d+ [a-f0-9]{32}$").expect("valid regex"))
    } else {
        None
    };

    let mut entries = Vec::new();
    let mut offset: u64 = 0;

    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(re) = &strict_re {
            if !re.is_match(line) {
                return Err("CAT manifest has a malformed entry.".to_string());
            }
        }
        let parts: Vec<&str> = line.split(' ').collect();
        if parts.len() < 4 {
            continue;
        }
        let size_str = parts[parts.len() - 3];
        let ts_str = parts[parts.len() - 2];
        let md5_str = parts[parts.len() - 1];

        let Ok(size) = size_str.parse::<u64>() else {
            if strict {
                return Err("CAT manifest has an invalid entry size.".to_string());
            }
            continue;
        };
        if entries.len() >= max_entries {
            return Err(format!(
                "CAT manifest exceeds the {max_entries}-entry limit{loc}"
            ));
        }
        // Keep offset inside JavaScript safe integer range (2^53 - 1) for parity.
        let next_offset = offset.checked_add(size).unwrap_or(u64::MAX);
        if next_offset > 9_007_199_254_740_991 {
            return Err(format!(
                "CAT entry offsets exceed JavaScript's safe integer range{loc}"
            ));
        }

        let name = parts[..parts.len() - 3].join(" ").replace('\\', "/");
        if strict {
            let safe = safe_catalog_name(&name);
            let drive_prefix = name.len() >= 2
                && name.as_bytes()[0].is_ascii_alphabetic()
                && name.as_bytes()[1] == b':';
            if safe.as_deref() != Some(name.as_str()) || drive_prefix {
                return Err("CAT manifest has an unsafe entry path.".to_string());
            }
        }

        let timestamp = ts_str.parse::<u64>().ok();
        if strict && timestamp.is_none() {
            return Err("CAT manifest has an invalid entry timestamp.".to_string());
        }
        let md5_lower = md5_str.to_ascii_lowercase();
        let md5 = if md5_lower.len() == 32 && md5_lower.bytes().all(|b| b.is_ascii_hexdigit()) {
            Some(md5_lower)
        } else {
            None
        };

        entries.push(CatEntry {
            name,
            size,
            offset,
            timestamp,
            md5,
        });
        offset = next_offset;
    }
    Ok(entries)
}

pub fn parse_cat_file(
    cat_path: &Path,
    max_manifest_bytes: u64,
    max_entries: usize,
    strict: bool,
) -> Result<Vec<CatEntry>, String> {
    let meta = fs::metadata(cat_path)
        .map_err(|e| format!("Failed to stat {}: {e}", cat_path.display()))?;
    if meta.len() > max_manifest_bytes {
        return Err(format!(
            "CAT manifest is {} bytes; the limit is {} bytes: {}",
            meta.len(),
            max_manifest_bytes,
            cat_path.display()
        ));
    }
    let text = fs::read_to_string(cat_path)
        .map_err(|e| format!("Failed to read {}: {e}", cat_path.display()))?;
    parse_cat_manifest(&text, max_entries, strict, &cat_path.to_string_lossy())
}

pub fn extract_cat_entry(dat_path: &Path, entry: &CatEntry) -> Result<Vec<u8>, String> {
    let mut file =
        File::open(dat_path).map_err(|e| format!("Failed to open {}: {e}", dat_path.display()))?;
    file.seek(SeekFrom::Start(entry.offset))
        .map_err(|e| format!("Failed to seek {}: {e}", dat_path.display()))?;
    let mut buf = vec![0u8; entry.size as usize];
    file.read_exact(&mut buf)
        .map_err(|e| format!("Failed to read {} ({} bytes): {e}", entry.name, entry.size))?;
    Ok(buf)
}

fn pair_extension_catalog_parts(parts: &[String]) -> Result<Vec<CatalogPair>, String> {
    let mut by_name: BTreeMap<String, String> = BTreeMap::new();
    for name in parts {
        by_name.insert(name.to_ascii_lowercase(), name.clone());
    }
    if parts.len() > MAX_EXTENSION_CATALOG_PARTS || by_name.len() != parts.len() {
        return Err("Installed catalog inventory is outside the read limits.".to_string());
    }
    let mut pairs = Vec::new();
    for (lower, original) in &by_name {
        let is_cat = lower.ends_with(".cat");
        let stem = &lower[..lower.len() - 4];
        let partner_key = format!("{stem}{}", if is_cat { ".dat" } else { ".cat" });
        let Some(other) = by_name.get(&partner_key) else {
            return Err("Installed catalog volume is missing its pair.".to_string());
        };
        if is_cat {
            pairs.push(CatalogPair {
                cat: original.clone(),
                dat: other.clone(),
            });
        }
    }
    Ok(pairs)
}

pub fn numbered_base_game_catalog_pairs(names: &[String]) -> Result<Vec<CatalogPair>, String> {
    let re = Regex::new(r"(?i)^\d{2}\.(cat|dat)$").unwrap();
    let candidates: Vec<&String> = names.iter().filter(|n| re.is_match(n)).collect();
    let mut by_name: HashMap<String, String> = HashMap::new();
    for name in &candidates {
        by_name.insert(name.to_ascii_lowercase(), (*name).clone());
    }
    if by_name.len() != candidates.len() {
        return Err("The game catalog inventory contains duplicate parts.".to_string());
    }
    let mut out = Vec::new();
    for index in 1..=99 {
        let cat_key = format!("{index:02}.cat");
        let dat_key = format!("{index:02}.dat");
        match (by_name.get(&cat_key), by_name.get(&dat_key)) {
            (None, None) => break,
            (Some(c), Some(d)) => out.push(CatalogPair {
                cat: c.clone(),
                dat: d.clone(),
            }),
            _ => return Err("A numbered game catalog is missing its pair.".to_string()),
        }
    }
    Ok(out)
}

pub fn ordered_extension_catalog_pairs(
    names: &[String],
    game_version: Option<u32>,
) -> Result<Vec<CatalogPair>, String> {
    let numbered_re = Regex::new(r"(?i)^ext_\d{2}\.(cat|dat)$").unwrap();
    let versioned_re = Regex::new(r"(?i)^ext_(?:(\d{2})_diff_)?v(\d{3,})\.(cat|dat)$").unwrap();

    let mut numbered: HashSet<String> = HashSet::new();
    let mut layers: HashMap<String, (u32, u32)> = HashMap::new();
    let mut selected: Vec<String> = Vec::new();

    for name in names {
        if numbered_re.is_match(name) {
            let num_str = name[4..6].to_string();
            let num: u32 = num_str.parse().unwrap_or(0);
            numbered.insert(num_str);
            layers.insert(name.to_ascii_lowercase(), (num, 0));
            selected.push(name.clone());
        }
    }

    for name in names {
        if let Some(caps) = versioned_re.captures(name) {
            let Some(gv) = game_version else {
                return Err("Versioned extension catalogs need a verified game version.".to_string());
            };
            let number_opt = caps.get(1).map(|m| m.as_str());
            let code = caps.get(2).unwrap().as_str();
            let version: u32 = code.parse().unwrap_or(0);
            let applicable = match number_opt {
                None => version == gv,
                Some(num_s) => gv >= 900 && numbered.contains(num_s) && version >= 100 && version <= gv,
            };
            if !applicable || code != version.to_string() {
                continue;
            }
            let num = number_opt.and_then(|s| s.parse::<u32>().ok()).unwrap_or(100);
            layers.insert(name.to_ascii_lowercase(), (num, version));
            selected.push(name.clone());
        }
    }

    let mut pairs = pair_extension_catalog_parts(&selected)?;
    pairs.sort_by_key(|p| layers[&p.cat.to_ascii_lowercase()]);
    Ok(pairs)
}

pub fn ordered_substitution_catalog_pairs(
    names: &[String],
    game_version: Option<u32>,
) -> Result<Vec<CatalogPair>, String> {
    let numbered_re = Regex::new(r"(?i)^subst_\d{2}\.(cat|dat)$").unwrap();
    let versioned_re = Regex::new(r"(?i)^subst_v(\d{3,})\.(cat|dat)$").unwrap();
    let mut selected = Vec::new();
    for name in names {
        if numbered_re.is_match(name) {
            selected.push(name.clone());
        } else if let Some(caps) = versioned_re.captures(name) {
            let Some(gv) = game_version else {
                return Err("Versioned substitution catalogs need a verified game version.".to_string());
            };
            if caps.get(1).unwrap().as_str() == gv.to_string() {
                selected.push(name.clone());
            }
        }
    }
    let mut pairs = pair_extension_catalog_parts(&selected)?;
    pairs.sort_by_key(|p| p.cat.to_ascii_lowercase());
    Ok(pairs)
}

struct PreparedPackEntry {
    name: String,
    size: u64,
    md5: String,
    sha256: String,
    timestamp: u64,
    bytes: Option<Vec<u8>>,
    source_path: Option<PathBuf>,
}

fn prepare_entry(entry: &PackInputEntry) -> Result<PreparedPackEntry, String> {
    let (bytes_opt, source_path_opt, md5_hex, sha_hex, actual_size) =
        if let Some(b64) = &entry.content_base64 {
            let decoded = BASE64_STD
                .decode(b64)
                .map_err(|e| format!("invalid base64 for {}: {e}", entry.name))?;
            let len = decoded.len() as u64;
            let md5_hex = hex::encode(Md5::digest(&decoded));
            let sha_hex = hex::encode(Sha256::digest(&decoded));
            (Some(decoded), None, md5_hex, sha_hex, len)
        } else if let Some(text) = &entry.content {
            let raw = text.as_bytes().to_vec();
            let len = raw.len() as u64;
            let md5_hex = hex::encode(Md5::digest(&raw));
            let sha_hex = hex::encode(Sha256::digest(&raw));
            (Some(raw), None, md5_hex, sha_hex, len)
        } else if let Some(src) = &entry.source_path {
            let p = PathBuf::from(src);
            let meta = fs::symlink_metadata(&p)
                .map_err(|e| format!("catalog source lstat {}: {e}", entry.name))?;
            if meta.file_type().is_symlink() || !meta.file_type().is_file() {
                return Err("catalog source is not a regular file".to_string());
            }
            let file = File::open(&p).map_err(|e| format!("catalog source open {}: {e}", entry.name))?;
            let mut reader = BufReader::with_capacity(1024 * 1024, file);
            let mut md5 = Md5::new();
            let mut sha = Sha256::new();
            let mut buf = vec![0u8; 1024 * 1024];
            let mut total: u64 = 0;
            loop {
                let n = reader.read(&mut buf).map_err(|e| format!("catalog source read {}: {e}", entry.name))?;
                if n == 0 {
                    break;
                }
                md5.update(&buf[..n]);
                sha.update(&buf[..n]);
                total += n as u64;
            }
            let md5_hex = hex::encode(md5.finalize());
            let sha_hex = hex::encode(sha.finalize());
            let keep_bytes = if total <= 256 * 1024 {
                fs::read(&p).ok()
            } else {
                None
            };
            (keep_bytes, Some(p), md5_hex, sha_hex, total)
        } else {
            return Err("entry has neither content nor sourcePath".to_string());
        };

    if actual_size != entry.size {
        return Err(format!(
            "source size changed ({} planned, {actual_size} read)",
            entry.size
        ));
    }
    if let Some(expected_sha) = &entry.expected_sha256 {
        if &sha_hex != expected_sha {
            return Err(format!(
                "source hash changed ({expected_sha} planned, {sha_hex} read)"
            ));
        }
    }

    Ok(PreparedPackEntry {
        name: entry.name.clone(),
        size: actual_size,
        md5: md5_hex,
        sha256: sha_hex,
        timestamp: entry.timestamp.unwrap_or(0),
        bytes: bytes_opt,
        source_path: source_path_opt,
    })
}

pub fn write_cat_dat_layout(layout: &PackLayoutInput, output_root: &Path) -> CatDatPackResult {
    let mut errors = layout.errors.clone();
    let mut volumes = Vec::new();
    if !errors.is_empty() {
        return CatDatPackResult {
            ok: false,
            volumes,
            errors,
        };
    }
    if let Err(e) = fs::create_dir_all(output_root) {
        errors.push(format!("Failed to create output directory: {e}"));
        return CatDatPackResult {
            ok: false,
            volumes,
            errors,
        };
    }

    let pid = std::process::id();
    for volume in &layout.volumes {
        let cat_path = output_root.join(&volume.cat_name);
        let dat_path = output_root.join(&volume.dat_name);
        if cat_path.exists() || dat_path.exists() {
            errors.push(format!(
                "Catalog output already exists: {} or {}",
                cat_path.display(),
                dat_path.display()
            ));
            break;
        }
        let cat_tmp = output_root.join(format!("{}.tmp-{pid}", volume.cat_name));
        let dat_tmp = output_root.join(format!("{}.tmp-{pid}", volume.dat_name));

        // Parallelize hashing and verification across all entries in the volume.
        let prepared_res: Result<Vec<PreparedPackEntry>, String> = volume
            .entries
            .par_iter()
            .map(prepare_entry)
            .collect();

        let prepared = match prepared_res {
            Ok(p) => p,
            Err(e) => {
                errors.push(e);
                break;
            }
        };

        let write_result: Result<Vec<PackedEntryReceipt>, String> = (|| {
            let dat_file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&dat_tmp)
                .map_err(|e| format!("Failed creating {}: {e}", dat_tmp.display()))?;
            let mut dat_writer = BufWriter::with_capacity(1024 * 1024, dat_file);
            let mut manifest = String::new();
            let mut receipts = Vec::with_capacity(prepared.len());

            for item in &prepared {
                if let Some(bytes) = &item.bytes {
                    dat_writer
                        .write_all(bytes)
                        .map_err(|e| format!("Failed writing {}: {e}", item.name))?;
                } else if let Some(src_path) = &item.source_path {
                    let src_file = File::open(src_path)
                        .map_err(|e| format!("Failed opening {}: {e}", src_path.display()))?;
                    let mut reader = BufReader::with_capacity(1024 * 1024, src_file);
                    let mut buf = vec![0u8; 1024 * 1024];
                    let mut remaining = item.size;
                    let mut rehash = Sha256::new();
                    while remaining > 0 {
                        let to_read = usize::try_from(remaining.min(buf.len() as u64)).unwrap();
                        let n = reader
                            .read(&mut buf[..to_read])
                            .map_err(|e| format!("Failed copying {}: {e}", item.name))?;
                        if n == 0 {
                            break;
                        }
                        dat_writer
                            .write_all(&buf[..n])
                            .map_err(|e| format!("Failed writing {}: {e}", item.name))?;
                        rehash.update(&buf[..n]);
                        remaining -= n as u64;
                    }
                    if remaining != 0 || hex::encode(rehash.finalize()) != item.sha256 {
                        return Err(format!("source file changed while packing: {}", item.name));
                    }
                }
                manifest.push_str(&format!(
                    "{} {} {} {}\n",
                    item.name, item.size, item.timestamp, item.md5
                ));
                receipts.push(PackedEntryReceipt {
                    name: item.name.clone(),
                    size: item.size,
                    md5: item.md5.clone(),
                    sha256: item.sha256.clone(),
                    timestamp: item.timestamp,
                });
            }
            dat_writer
                .flush()
                .map_err(|e| format!("Failed flushing dat: {e}"))?;
            drop(dat_writer);

            if manifest.len() as u64 != volume.cat_bytes {
                return Err("catalog manifest size changed".to_string());
            }
            let mut cat_file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&cat_tmp)
                .map_err(|e| format!("Failed creating {}: {e}", cat_tmp.display()))?;
            cat_file
                .write_all(manifest.as_bytes())
                .map_err(|e| format!("Failed writing cat: {e}"))?;
            cat_file
                .flush()
                .map_err(|e| format!("Failed flushing cat: {e}"))?;
            drop(cat_file);

            fs::rename(&dat_tmp, &dat_path)
                .map_err(|e| format!("Failed finalizing dat: {e}"))?;
            if let Err(e) = fs::rename(&cat_tmp, &cat_path) {
                let _ = fs::remove_file(&dat_path);
                return Err(format!("Failed finalizing cat: {e}"));
            }
            Ok(receipts)
        })();

        match write_result {
            Ok(receipts) => {
                let total_bytes: u64 = receipts.iter().map(|r| r.size).sum();
                volumes.push(PackedVolumeReceipt {
                    index: volume.index,
                    cat_path: cat_path.to_string_lossy().into_owned(),
                    dat_path: dat_path.to_string_lossy().into_owned(),
                    bytes: total_bytes,
                    entries: receipts,
                });
            }
            Err(e) => {
                let _ = fs::remove_file(&cat_tmp);
                let _ = fs::remove_file(&dat_tmp);
                errors.push(e);
                break;
            }
        }
    }

    CatDatPackResult {
        ok: errors.is_empty(),
        volumes,
        errors,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn parses_paths_with_spaces_and_offsets_from_right() {
        let sample = "\
libraries/wares.xml 12 100 0123456789abcdef0123456789abcdef\n\
assets/fx/textures/my spaced file.gz 8 200 fedcba9876543210fedcba9876543210\n";
        let parsed = parse_cat_manifest(sample, MAX_CAT_ENTRIES, true, "test.cat").unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].name, "libraries/wares.xml");
        assert_eq!(parsed[0].offset, 0);
        assert_eq!(parsed[0].size, 12);
        assert_eq!(parsed[1].name, "assets/fx/textures/my spaced file.gz");
        assert_eq!(parsed[1].offset, 12);
        assert_eq!(parsed[1].size, 8);
    }

    #[test]
    fn selects_base_extension_and_substitution_pairs() {
        let base_names = vec![
            "01.cat".into(),
            "01.dat".into(),
            "02.cat".into(),
            "02.dat".into(),
            "04.cat".into(),
            "04.dat".into(),
        ];
        let base = numbered_base_game_catalog_pairs(&base_names).unwrap();
        assert_eq!(base.len(), 2);

        let ext_names = vec![
            "ext_01.cat".into(),
            "ext_01.dat".into(),
            "ext_01_diff_v800.cat".into(),
            "ext_01_diff_v800.dat".into(),
            "ext_v900.cat".into(),
            "ext_v900.dat".into(),
        ];
        let ext = ordered_extension_catalog_pairs(&ext_names, Some(900)).unwrap();
        assert_eq!(ext.len(), 3);
        assert_eq!(ext[0].cat, "ext_01.cat");
        assert_eq!(ext[1].cat, "ext_01_diff_v800.cat");
        assert_eq!(ext[2].cat, "ext_v900.cat");
    }

    #[test]
    fn packs_reads_and_extracts_round_trip() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("x4_catdat_test_{nanos}"));
        fs::create_dir_all(&dir).unwrap();

        let src_file = dir.join("source_hello.xml");
        fs::write(&src_file, b"<hello world=\"1\"/>").unwrap();

        let e1_name = "md/my cue.xml";
        let e1_bytes = b"<mdscript name=\"Test\"/>";
        let cat_row_1 = format!("{e1_name} {} 0 {}\n", e1_bytes.len(), "0".repeat(32));
        let cat_row_2 = format!(
            "libraries/hello.xml {} 42 {}\n",
            b"<hello world=\"1\"/>".len(),
            "0".repeat(32)
        );
        let layout = PackLayoutInput {
            errors: vec![],
            volumes: vec![PackLayoutVolume {
                index: 1,
                cat_name: "ext_01.cat".into(),
                dat_name: "ext_01.dat".into(),
                cat_bytes: (cat_row_1.len() + cat_row_2.len()) as u64,
                dat_bytes: (e1_bytes.len() + b"<hello world=\"1\"/>".len()) as u64,
                entries: vec![
                    PackInputEntry {
                        name: e1_name.into(),
                        size: e1_bytes.len() as u64,
                        source_path: None,
                        content: None,
                        content_base64: Some(BASE64_STD.encode(e1_bytes)),
                        expected_sha256: None,
                        timestamp: Some(0),
                    },
                    PackInputEntry {
                        name: "libraries/hello.xml".into(),
                        size: b"<hello world=\"1\"/>".len() as u64,
                        source_path: Some(src_file.to_string_lossy().into_owned()),
                        content: None,
                        content_base64: None,
                        expected_sha256: Some(hex::encode(Sha256::digest(b"<hello world=\"1\"/>"))),
                        timestamp: Some(42),
                    },
                ],
            }],
        };

        let out_dir = dir.join("out");
        let packed = write_cat_dat_layout(&layout, &out_dir);
        assert!(packed.ok, "pack errors: {:?}", packed.errors);
        assert_eq!(packed.volumes.len(), 1);

        let entries = parse_cat_file(
            &out_dir.join("ext_01.cat"),
            MAX_CAT_MANIFEST_BYTES,
            MAX_CAT_ENTRIES,
            true,
        )
        .unwrap();
        assert_eq!(entries.len(), 2);
        let extracted = extract_cat_entry(&out_dir.join("ext_01.dat"), &entries[1]).unwrap();
        assert_eq!(extracted, b"<hello world=\"1\"/>");

        let _ = fs::remove_dir_all(&dir);
    }
}
