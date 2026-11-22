/** Authored script call help and exact parameter-name ranges. */
import { buildAuthoredAiScriptIndex, resolveAuthoredAiScript } from "../../shared/aiScriptIdentity";
import { readAiScriptCallDocument, type AiScriptNavigationDocument } from "./aiScriptNavigation";
import { buildMdLibraryIndex, mdLibraryAcceptsArguments, parseMdScriptRoot, resolveMdLibraryReference } from "../../shared/mdDeclarationResolution";
import { MAX_PROJECT_XML_DEPTH, scanXmlTagTokens } from "../../shared/xmlMarkup";
import { MAX_MD_DEFINITION_SOURCE, readMdDefinitionDocument, type MdDefinitionDocument } from "./langNav";

interface TagPosition { tag: string; start: number; }
interface AttributeSpan { start: number; end: number; }
interface CallCursor {
  callStart: number;
  parameterStart?: number;
  argumentName?: string;
  nameRange?: AttributeSpan;
  unfinishedEnd?: number;
}

/** Identify a sibling before decoding its declarations, even when its body is malformed. */
export function mdCallScriptHeader(text: string): string | undefined {
  const token = scanXmlTagTokens(text).next().value;
  if (!token || !token.complete || !/^<mdscript(?=[\s/>])/.test(token.token)) return undefined;
  const root = parseMdScriptRoot(token.token.replace(/\/?\s*>$/, "/>"));
  const name = root?.getAttribute("name") ?? "";
  return /^[A-Za-z_]\w*$/.test(name) ? name : undefined;
}

/** Only inspect the selected opening tag. Quoted `>` and both quote styles stay inside the value. */
function readParameterCursor(text: string, start: number, cursor: number) {
  const nextTag = text.indexOf("<", cursor);
  const end = nextTag < 0 ? text.length : nextTag;
  const token = scanXmlTagTokens(text.slice(start, end)).next().value;
  if (!token || token.start !== 0) return undefined;
  const attribute = /\s+([A-Za-z_][\w.:-]*)\s*=\s*(["'])/y;
  attribute.lastIndex = "<param".length;
  let argumentName: string | undefined;
  let nameRange: AttributeSpan | undefined;
  let unfinishedEnd: number | undefined;
  const seen = new Set<string>();
  for (let match = attribute.exec(token.token); match; match = attribute.exec(token.token)) {
    if (seen.has(match[1]) || match[1] === "xmlns") return undefined;
    seen.add(match[1]);
    const valueStart = attribute.lastIndex;
    const quoteEnd = token.token.indexOf(match[2], valueStart);
    // In an unfinished name, replace the identifier being typed and leave any later markup in place.
    const valueEnd = quoteEnd >= 0 ? quoteEnd : valueStart + (token.token.slice(valueStart).match(/^\w*/)?.[0].length ?? 0);
    if (match[1] === "name") {
      argumentName = token.token.slice(valueStart, valueEnd);
      if (start + valueStart <= cursor && cursor <= start + valueEnd) {
        nameRange = { start: start + valueStart, end: start + valueEnd };
      }
    }
    if (quoteEnd < 0) {
      if (match[1] === "name" || match[1] === "value") unfinishedEnd = end;
      break;
    }
    attribute.lastIndex = quoteEnd + 1;
  }
  return { argumentName, nameRange, unfinishedEnd };
}

function scriptCallOpening(
  text: string, cursor: number, nameCompletion: boolean, script: "mdscript" | "aiscript",
): number | undefined {
  if (text.length > MAX_MD_DEFINITION_SOURCE || cursor < 1 || cursor > text.length) return undefined;
  const start = text.lastIndexOf("<", cursor - 1);
  if (start < 0 || (nameCompletion && !text.startsWith("<param", start))) return undefined;
  const opening = script === "mdscript" ? /^<(?:param|run_actions|cue)(?=[\s/>]|$)/ : /^<(?:param|run_script)(?=[\s/>]|$)/;
  return opening.test(text.slice(start, start + 14)) ? start : undefined;
}

/** Identify a direct call or direct parameter using Forge's XML token scanner. */
function scriptCallCursor(
  text: string, cursor: number, nameCompletion: boolean, script: "mdscript" | "aiscript",
): CallCursor | undefined {
  const start = scriptCallOpening(text, cursor, nameCompletion, script);
  if (start === undefined) return undefined;
  const isCall = (tag?: string) => script === "aiscript" ? tag === "run_script" : tag === "run_actions" || tag === "cue";
  const stack: TagPosition[] = [];
  for (const token of scanXmlTagTokens(text.slice(0, cursor))) {
    const opener = /^<(\/?)([A-Za-z_][\w.:-]*)(?=[\s/>]|$)/.exec(token.token);
    if (!opener) return undefined;
    const [, closing, tag] = opener;
    if (!token.complete) {
      if (closing || token.start !== start || stack[0]?.tag !== script) return undefined;
      if (tag === "param") {
        const parent = stack.at(-1);
        if (!parent || !isCall(parent.tag)) return undefined;
        const parameter = readParameterCursor(text, token.start, cursor);
        if (!parameter || (nameCompletion && !parameter.nameRange)) return undefined;
        return { callStart: parent.start, parameterStart: token.start, ...parameter };
      }
      if (!nameCompletion && isCall(tag)) return { callStart: token.start };
      return undefined;
    }
    if (closing) {
      if (stack.pop()?.tag !== tag) return undefined;
    } else if (!/\/\s*>$/.test(token.token)) {
      if (stack.length >= MAX_PROJECT_XML_DEPTH) return undefined;
      stack.push({ tag, start: token.start });
    }
  }
  return undefined;
}

export type MdCallHelpMode = "signature" | "completion" | "definition";

export function readMdCallHelpRequest(file: string, text: string, cursor: number, mode: MdCallHelpMode = "signature") {
  const context = scriptCallCursor(text, cursor, mode !== "signature", "mdscript");
  if (!context || (mode === "definition" && (!context.argumentName || context.unfinishedEnd !== undefined))) return undefined;
  const options = { callStart: context.callStart, includeSignatures: true };
  let origin = readMdDefinitionDocument(file, text, undefined, false, options);
  if (!origin && context.parameterStart !== undefined && context.unfinishedEnd !== undefined) {
    // For a single unfinished direct param tag, keep all surviving declarations at their authored offsets.
    // The recovered text is used only to query the caller and its declarations.
    origin = readMdDefinitionDocument(file, maskCurrentParameter(text, context.parameterStart, context.unfinishedEnd), undefined, false, options);
  }
  if (!origin?.call) return undefined;
  const { ref } = origin.call;
  const script = ref.startsWith("md.") ? ref.split(".")[1] : origin.name;
  return { origin, context, script };
}

export function resolveMdCallHelp(
  request: NonNullable<ReturnType<typeof readMdCallHelpRequest>>, siblings: readonly MdDefinitionDocument[],
) {
  const { origin, context } = request;
  const call = origin.call!;
  const resolved = resolveMdLibraryReference(buildMdLibraryIndex([origin, ...siblings]), origin.name, call.ref);
  const library = resolved?.library;
  const signature = library?.source.signature;
  if (!resolved || !library || !library.source.location || signature?.status !== "known"
    || !mdLibraryAcceptsArguments(call.role, library.purpose)) return undefined;
  const argument = call.arguments.find(argument => argument.point === context.parameterStart);
  const active = argument?.name ?? context.argumentName;
  const supplied = new Set(call.arguments.filter(argument => argument.point !== context.parameterStart).map(argument => argument.name));
  const activeIndex = signature.parameters.findIndex(parameter => parameter.name === active);
  const unsupplied = signature.parameters.filter(parameter => !supplied.has(parameter.name));
  unsupplied.sort((first, second) => Number(first.hasDefault) - Number(second.hasDefault));
  return {
    name: `md.${resolved.script.name}.${library.name}`,
    location: library.source.location,
    parameters: signature.parameters,
    parameterLocation: context.nameRange && argument && activeIndex >= 0
      ? signature.parameters[activeIndex].point
      : undefined,
    activeParameter: activeIndex >= 0 ? activeIndex : Math.max(0, signature.parameters.findIndex(parameter => !supplied.has(parameter.name))),
    unsupplied,
    nameRange: context.nameRange,
  };
}

function maskCurrentParameter(text: string, start: number, end: number): string {
  const masked = text.slice(start, end).replace(/[^\r\n]/g, " ");
  return text.slice(0, start) + masked + text.slice(end);
}

export type AiScriptCallHelpMode = "signature" | "completion" | "hover" | "definition";

export function isAiScriptCallCandidate(text: string, cursor: number, mode: AiScriptCallHelpMode): boolean {
  return scriptCallOpening(text, cursor, mode !== "signature", "aiscript") !== undefined;
}

export function readAiScriptCallHelpRequest(
  file: string, text: string, cursor: number, mode: AiScriptCallHelpMode,
) {
  const context = scriptCallCursor(text, cursor, mode !== "signature", "aiscript");
  const requiresExactName = mode === "definition" || mode === "hover";
  if (!context || (requiresExactName && (!context.argumentName || context.unfinishedEnd !== undefined))) return undefined;

  const options = {
    callStart: context.callStart, parameterStart: context.parameterStart, includeSignature: true,
    editingParameterName: mode === "completion",
  };
  let origin = readAiScriptCallDocument(file, text, options);
  if (!origin.call && context.parameterStart !== undefined && context.unfinishedEnd !== undefined) {
    origin = readAiScriptCallDocument(file, maskCurrentParameter(text, context.parameterStart, context.unfinishedEnd), {
      ...options, parameterStart: undefined,
    });
  }
  if (!origin.call || (requiresExactName && !origin.call.activeArgument)) return undefined;
  return { origin, context };
}

export function resolveAiScriptCallHelp(
  request: NonNullable<ReturnType<typeof readAiScriptCallHelpRequest>>, files: readonly AiScriptNavigationDocument[],
) {
  const { origin, context } = request;
  const call = origin.call;
  if (!origin.name || !call) return undefined;
  const scriptName = (file: AiScriptNavigationDocument) => file.name;
  const index = buildAuthoredAiScriptIndex(files, scriptName);
  if (resolveAuthoredAiScript(index, origin.name, scriptName) !== origin) return undefined;
  const target = resolveAuthoredAiScript(index, call.callee, scriptName);
  if (!target?.declaration || !target.signature) return undefined;

  const supplied = new Set(call.arguments.map(argument => argument.name.toLowerCase()));
  const activeIndex = target.signature.findIndex(parameter => parameter.name === (call.activeArgument ?? context.argumentName));
  const unsupplied = target.signature.filter(parameter => !supplied.has(parameter.name.toLowerCase()));
  unsupplied.sort((first, second) => Number(first.hasDefault) - Number(second.hasDefault));
  const parameter = target.signature[activeIndex];
  return {
    name: call.callee,
    location: { file: target.path, ...target.declaration },
    parameters: target.signature,
    parameter,
    parameterLocation: context.nameRange && call.activeArgument ? parameter?.location : undefined,
    activeParameter: activeIndex >= 0 ? activeIndex : Math.max(0, target.signature.findIndex(parameter => !supplied.has(parameter.name.toLowerCase()))),
    unsupplied,
    nameRange: context.nameRange,
  };
}

export type AiScriptCallHelp = NonNullable<ReturnType<typeof resolveAiScriptCallHelp>>;
