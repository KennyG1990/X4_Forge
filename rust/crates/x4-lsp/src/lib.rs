pub mod analysis;
pub mod providers;
pub mod server;
pub mod transport;

use std::path::PathBuf;

#[derive(Debug, Clone, Default)]
pub struct LspOptions {
    pub unpacked_root: Option<PathBuf>,
    pub corpus_cache: Option<PathBuf>,
}

pub fn run_stdio_lsp(opts: LspOptions) -> Result<i32, String> {
    server::run_stdio_loop(opts)
}
