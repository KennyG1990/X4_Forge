use crate::analysis::{collect_mod_files, normalize_uri_key, ModContext};
use crate::providers::{
    compute_code_actions, compute_code_lenses, compute_completion, compute_definition,
    compute_diagnostics, compute_document_symbols, compute_folding_ranges, compute_hover,
    compute_inlay_hints, compute_prepare_rename, compute_references, compute_rename,
    compute_semantic_tokens, compute_signature_help, compute_workspace_symbols,
    semantic_token_types,
};
use crate::transport::{read_message, write_message};
use crate::LspOptions;
use lsp_types::{
    CodeActionParams, CodeActionProviderCapability, CodeLensOptions, CodeLensParams,
    CompletionOptions, CompletionParams, DidChangeTextDocumentParams, DidCloseTextDocumentParams,
    DidOpenTextDocumentParams, DidSaveTextDocumentParams, DocumentSymbolParams,
    DocumentSymbolResponse, FoldingRangeParams, FoldingRangeProviderCapability, GotoDefinitionParams,
    GotoDefinitionResponse, HoverParams, HoverProviderCapability, InitializeResult, InlayHintParams,
    OneOf, ReferenceParams, RenameOptions, RenameParams, SemanticTokensFullOptions,
    SemanticTokensLegend, SemanticTokensOptions, SemanticTokensParams,
    SemanticTokensServerCapabilities, ServerCapabilities, ServerInfo, SignatureHelpOptions,
    SignatureHelpParams, TextDocumentSyncCapability, TextDocumentSyncKind, Url,
    WorkspaceSymbolParams,
};
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{self, BufReader, BufWriter, Write};
use x4_corpus::CorpusIndex;
use x4_validate::xsd::XsdRegistry;
use x4_validate::{resolve_corpus_and_schemas, ValidateOptions};

struct LspState {
    corpus: CorpusIndex,
    xsd_reg: XsdRegistry,
    open_docs: HashMap<String, (Url, String)>,
    shutdown_requested: bool,
}

impl LspState {
    fn from_options(opts: &LspOptions) -> Self {
        let v_opts = ValidateOptions {
            unpacked_root: opts.unpacked_root.clone(),
            corpus_cache: opts.corpus_cache.clone(),
            ..Default::default()
        };
        let (corpus, xsd_reg) = match resolve_corpus_and_schemas(&v_opts) {
            Ok(pair) => pair,
            Err(err) => {
                eprintln!("x4forge lsp: proceeding without reference corpus ({err})");
                (CorpusIndex::default(), XsdRegistry::default())
            }
        };
        Self {
            corpus,
            xsd_reg,
            open_docs: HashMap::new(),
            shutdown_requested: false,
        }
    }

    fn mod_context(&self, uri: &Url) -> ModContext {
        collect_mod_files(uri, &self.open_docs)
    }
}

pub fn run_stdio_loop(opts: LspOptions) -> Result<i32, String> {
    let mut state = LspState::from_options(&opts);
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut reader = BufReader::new(stdin.lock());
    let mut writer = BufWriter::new(stdout.lock());

    loop {
        let msg = match read_message(&mut reader) {
            Ok(Some(v)) => v,
            Ok(None) => return Ok(if state.shutdown_requested { 0 } else { 0 }),
            Err(e) => return Err(format!("LSP transport error: {e}")),
        };

        let id = msg.get("id").cloned();
        let method = msg
            .get("method")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let params = msg.get("params").cloned().unwrap_or(Value::Null);

        if method == "exit" {
            return Ok(if state.shutdown_requested { 0 } else { 1 });
        }

        if let Some(req_id) = id {
            let reply = handle_request(&mut state, &method, params);
            let frame = match reply {
                Ok(result) => json!({
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": result,
                }),
                Err((code, message)) => json!({
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": { "code": code, "message": message },
                }),
            };
            write_message(&mut writer, &frame)
                .map_err(|e| format!("LSP stdout write error: {e}"))?;
        } else if let Err(e) = handle_notification(&mut state, &method, params, &mut writer) {
            eprintln!("x4forge lsp notification error ({method}): {e}");
        }
    }
}

fn parse_params<T: DeserializeOwned>(params: Value) -> Result<T, (i32, String)> {
    serde_json::from_value(params).map_err(|e| (-32602, format!("Invalid params: {e}")))
}

fn handle_notification<W: Write>(
    state: &mut LspState,
    method: &str,
    params: Value,
    writer: &mut W,
) -> io::Result<()> {
    match method {
        "initialized" | "$/cancelRequest" | "$/setTrace" => {}
        "textDocument/didOpen" => {
            if let Ok(p) = serde_json::from_value::<DidOpenTextDocumentParams>(params) {
                let uri = p.text_document.uri;
                let key = normalize_uri_key(&uri);
                state.open_docs.insert(key, (uri.clone(), p.text_document.text));
                publish_diagnostics(state, &uri, writer)?;
            }
        }
        "textDocument/didChange" => {
            if let Ok(p) = serde_json::from_value::<DidChangeTextDocumentParams>(params) {
                let uri = p.text_document.uri;
                let key = normalize_uri_key(&uri);
                if let Some(last) = p.content_changes.into_iter().last() {
                    state.open_docs.insert(key, (uri.clone(), last.text));
                    publish_diagnostics(state, &uri, writer)?;
                }
            }
        }
        "textDocument/didSave" => {
            if let Ok(p) = serde_json::from_value::<DidSaveTextDocumentParams>(params) {
                let uri = p.text_document.uri;
                if let Some(txt) = p.text {
                    let key = normalize_uri_key(&uri);
                    state.open_docs.insert(key, (uri.clone(), txt));
                }
                publish_diagnostics(state, &uri, writer)?;
            }
        }
        "textDocument/didClose" => {
            if let Ok(p) = serde_json::from_value::<DidCloseTextDocumentParams>(params) {
                let uri = p.text_document.uri;
                let key = normalize_uri_key(&uri);
                state.open_docs.remove(&key);
                let note = json!({
                    "jsonrpc": "2.0",
                    "method": "textDocument/publishDiagnostics",
                    "params": { "uri": uri, "diagnostics": [] }
                });
                write_message(writer, &note)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn publish_diagnostics<W: Write>(
    state: &LspState,
    uri: &Url,
    writer: &mut W,
) -> io::Result<()> {
    let ctx = state.mod_context(uri);
    let diags = compute_diagnostics(&ctx, &state.corpus, &state.xsd_reg);
    let note = json!({
        "jsonrpc": "2.0",
        "method": "textDocument/publishDiagnostics",
        "params": {
            "uri": uri,
            "diagnostics": diags,
        }
    });
    write_message(writer, &note)
}

fn handle_request(
    state: &mut LspState,
    method: &str,
    params: Value,
) -> Result<Value, (i32, String)> {
    match method {
        "initialize" => {
            let caps = ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                completion_provider: Some(CompletionOptions {
                    trigger_characters: Some(vec![
                        "<".into(),
                        " ".into(),
                        "\"".into(),
                        ".".into(),
                        ",".into(),
                    ]),
                    ..Default::default()
                }),
                signature_help_provider: Some(SignatureHelpOptions {
                    trigger_characters: Some(vec!["[".into(), ",".into()]),
                    ..Default::default()
                }),
                definition_provider: Some(OneOf::Left(true)),
                references_provider: Some(OneOf::Left(true)),
                document_symbol_provider: Some(OneOf::Left(true)),
                folding_range_provider: Some(FoldingRangeProviderCapability::Simple(true)),
                semantic_tokens_provider: Some(
                    SemanticTokensServerCapabilities::SemanticTokensOptions(
                        SemanticTokensOptions {
                            legend: SemanticTokensLegend {
                                token_types: semantic_token_types(),
                                token_modifiers: Vec::new(),
                            },
                            full: Some(SemanticTokensFullOptions::Bool(true)),
                            range: Some(false),
                            ..Default::default()
                        },
                    ),
                ),
                inlay_hint_provider: Some(OneOf::Left(true)),
                code_lens_provider: Some(CodeLensOptions {
                    resolve_provider: Some(false),
                }),
                rename_provider: Some(OneOf::Right(RenameOptions {
                    prepare_provider: Some(true),
                    work_done_progress_options: Default::default(),
                })),
                code_action_provider: Some(CodeActionProviderCapability::Simple(true)),
                workspace_symbol_provider: Some(OneOf::Left(true)),
                ..Default::default()
            };
            let res = InitializeResult {
                capabilities: caps,
                server_info: Some(ServerInfo {
                    name: "x4forge-lsp".to_string(),
                    version: Some("0.1.0".to_string()),
                }),
            };
            Ok(serde_json::to_value(res).unwrap())
        }
        "shutdown" => {
            state.shutdown_requested = true;
            Ok(Value::Null)
        }
        "textDocument/foldingRange" => {
            let p: FoldingRangeParams = parse_params(params)?;
            let ctx = state.mod_context(&p.text_document.uri);
            let res = compute_folding_ranges(&ctx.active().text);
            Ok(serde_json::to_value(res).unwrap())
        }
        "textDocument/documentSymbol" => {
            let p: DocumentSymbolParams = parse_params(params)?;
            let ctx = state.mod_context(&p.text_document.uri);
            let active = ctx.active();
            let syms = compute_document_symbols(&active.rel_path, &active.text);
            Ok(serde_json::to_value(DocumentSymbolResponse::Nested(syms)).unwrap())
        }
        "textDocument/semanticTokens/full" => {
            let p: SemanticTokensParams = parse_params(params)?;
            let ctx = state.mod_context(&p.text_document.uri);
            let sem = compute_semantic_tokens(&ctx.active().text);
            Ok(serde_json::to_value(sem).unwrap())
        }
        "textDocument/inlayHint" => {
            let p: InlayHintParams = parse_params(params)?;
            let ctx = state.mod_context(&p.text_document.uri);
            let hints = compute_inlay_hints(&ctx, Some(p.range));
            Ok(serde_json::to_value(hints).unwrap())
        }
        "textDocument/codeLens" => {
            let p: CodeLensParams = parse_params(params)?;
            let ctx = state.mod_context(&p.text_document.uri);
            let lenses = compute_code_lenses(&ctx);
            Ok(serde_json::to_value(lenses).unwrap())
        }
        "textDocument/signatureHelp" => {
            let p: SignatureHelpParams = parse_params(params)?;
            let ctx = state.mod_context(&p.text_document_position_params.text_document.uri);
            let sig = compute_signature_help(&ctx, p.text_document_position_params.position);
            Ok(serde_json::to_value(sig).unwrap())
        }
        "textDocument/definition" => {
            let p: GotoDefinitionParams = parse_params(params)?;
            let ctx = state.mod_context(&p.text_document_position_params.text_document.uri);
            let locs = compute_definition(&ctx, p.text_document_position_params.position);
            Ok(serde_json::to_value(GotoDefinitionResponse::Array(locs)).unwrap())
        }
        "textDocument/references" => {
            let p: ReferenceParams = parse_params(params)?;
            let ctx = state.mod_context(&p.text_document_position.text_document.uri);
            let locs = compute_references(
                &ctx,
                p.text_document_position.position,
                p.context.include_declaration,
            );
            Ok(serde_json::to_value(locs).unwrap())
        }
        "textDocument/prepareRename" => {
            let p: lsp_types::TextDocumentPositionParams = parse_params(params)?;
            let ctx = state.mod_context(&p.text_document.uri);
            let prep = compute_prepare_rename(&ctx, p.position);
            Ok(serde_json::to_value(prep).unwrap())
        }
        "textDocument/rename" => {
            let p: RenameParams = parse_params(params)?;
            let ctx = state.mod_context(&p.text_document_position.text_document.uri);
            match compute_rename(&ctx, p.text_document_position.position, &p.new_name) {
                Ok(edit) => Ok(serde_json::to_value(edit).unwrap()),
                Err(reason) => Err((-32602, reason)),
            }
        }
        "textDocument/hover" => {
            let p: HoverParams = parse_params(params)?;
            let ctx = state.mod_context(&p.text_document_position_params.text_document.uri);
            let hover = compute_hover(
                &ctx,
                p.text_document_position_params.position,
                &state.corpus,
                &state.xsd_reg,
            );
            Ok(serde_json::to_value(hover).unwrap())
        }
        "textDocument/completion" => {
            let p: CompletionParams = parse_params(params)?;
            let ctx = state.mod_context(&p.text_document_position.text_document.uri);
            let items = compute_completion(
                &ctx,
                p.text_document_position.position,
                &state.corpus,
                &state.xsd_reg,
            );
            Ok(serde_json::to_value(items).unwrap())
        }
        "textDocument/codeAction" => {
            let p: CodeActionParams = parse_params(params)?;
            let ctx = state.mod_context(&p.text_document.uri);
            let actions = compute_code_actions(&ctx, p.range, &p.context, &state.xsd_reg);
            Ok(serde_json::to_value(actions).unwrap())
        }
        "workspace/symbol" => {
            let p: WorkspaceSymbolParams = parse_params(params)?;
            let any_uri = state
                .open_docs
                .values()
                .next()
                .map(|(u, _)| u.clone())
                .unwrap_or_else(|| Url::parse("file:///workspace/").unwrap());
            let ctx = state.mod_context(&any_uri);
            let syms = compute_workspace_symbols(&ctx, &p.query);
            Ok(serde_json::to_value(syms).unwrap())
        }
        _ => Err((-32601, format!("Method not found: {method}"))),
    }
}
