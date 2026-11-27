pub mod discovery;
pub mod http_loopback;
pub mod native_tools;
pub mod proxy;

use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpMode {
    Auto,
    Standalone,
    Proxy,
}

impl McpMode {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s.trim().to_ascii_lowercase().as_str() {
            "auto" => Ok(Self::Auto),
            "standalone" => Ok(Self::Standalone),
            "proxy" => Ok(Self::Proxy),
            _ => Err(format!(
                "Invalid --mode '{s}'. Expected auto, standalone, or proxy."
            )),
        }
    }
}

#[derive(Debug, Clone)]
pub struct McpOptions {
    pub mode: McpMode,
    pub unpacked_root: Option<PathBuf>,
    pub corpus_cache: Option<PathBuf>,
    pub url: Option<String>,
    pub api_key: Option<String>,
    pub workspace_id: Option<String>,
    pub discovery_dir: Option<PathBuf>,
}

impl Default for McpOptions {
    fn default() -> Self {
        Self {
            mode: McpMode::Auto,
            unpacked_root: None,
            corpus_cache: None,
            url: None,
            api_key: None,
            workspace_id: None,
            discovery_dir: None,
        }
    }
}

pub fn run_stdio_mcp(opts: McpOptions) -> Result<i32, String> {
    proxy::run_stdio_loop(opts)
}
