pub mod auth;
pub mod capabilities;
pub mod db;
pub mod routes;
pub mod server;
pub mod static_files;
pub mod upstream;

use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct ServeOptions {
    pub host: String,
    pub port: u16,
    pub data_dir: PathBuf,
    pub static_dir: Option<PathBuf>,
    pub unpacked_root: Option<PathBuf>,
    pub corpus_cache: Option<PathBuf>,
    pub studio_token: Option<String>,
    pub mode: String,
    pub version: String,
    pub discovery_dir: Option<PathBuf>,
    pub no_discovery: bool,
    pub ready_json: bool,
    pub upstream_url: Option<String>,
}

impl Default for ServeOptions {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 3000,
            data_dir: PathBuf::from("data"),
            static_dir: None,
            unpacked_root: None,
            corpus_cache: None,
            studio_token: None,
            mode: "default".to_string(),
            version: "0.0.98".to_string(),
            discovery_dir: None,
            no_discovery: false,
            ready_json: false,
            upstream_url: None,
        }
    }
}

pub fn run_serve(opts: ServeOptions) -> Result<i32, String> {
    server::run_serve_blocking(opts)
}
