/** Authored Mission Director library-call help and exact parameter-name ranges. */
import { buildMdLibraryIndex, mdLibraryAcceptsArguments, parseMdScriptRoot, resolveMdLibraryReference } from "../../shared/mdDeclarationResolution";
import { MAX_PROJECT_XML_DEPTH, scanXmlTagTokens } from "../../shared/xmlMarkup";
import { MAX_MD_DEFINITION_SOURCE, readMdDefinitionDocument, type MdDefinitionDocument } from "./langNav";

interface TagPosition { tag: string; start: number; }
interface AttributeSpan { start: number; end: number; }
interface MdCallCursor {
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

/** Identify a direct call or direct parameter using the same XML token scanner as Forge's source tools. */
function mdCallCursor(text: string, cursor: number, nameCompletion: boolean): MdCallCursor | undefined {
  if (text.length > MAX_MD_DEFINITION_SOURCE || cursor < 1 || cursor > text.length) return undefined;
  const start = text.lastIndexOf("<", cursor - 1);
  if (nameCompletion && !text.startsWith("<param", start)) return undefined;
  if (start < 0 || !/^<(?:param|run_actions|cue)(?=[\s/>]|$)/.test(text.slice(start, start + 14))) return undefined;
  const stack: TagPosition[] = [];
  for (const token of scanXmlTagTokens(text.slice(0, cursor))) {
    const opener = /^<(\/?)([A-Za-z_][\w.:-]*)(?=[\s/>]|$)/.exec(token.token);
    if (!opener) return undefined;
    const [, closing, tag] = opener;
    if (!token.complete) {
      if (closing || token.start !== start || stack[0]?.tag !== "mdscript") return undefined;
      if (tag === "param") {
        const parent = stack.at(-1);
        if (parent?.tag !== "run_actions" && parent?.tag !== "cue") return undefined;
        const parameter = readParameterCursor(text, token.start, cursor);
        if (!parameter || (nameCompletion && !parameter.nameRange)) return undefined;
        return { callStart: parent.start, parameterStart: token.start, ...parameter };
      }
      if (!nameCompletion && (tag === "run_actions" || tag === "cue")) return { callStart: token.start };
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

export function readMdCallHelpRequest(file: string, text: string, cursor: number, nameCompletion = false) {
  const context = mdCallCursor(text, cursor, nameCompletion);
  if (!context) return undefined;
  const options = { callStart: context.callStart, includeSignatures: true };
  let origin = readMdDefinitionDocument(file, text, undefined, false, options);
  if (!origin && context.parameterStart !== undefined && context.unfinishedEnd !== undefined) {
    // For a single unfinished direct param tag, keep all surviving declarations at their authored offsets.
    // The recovered text is used only to query the caller and its declarations.
    const { parameterStart, unfinishedEnd } = context;
    const masked = text.slice(parameterStart, unfinishedEnd).replace(/[^\r\n]/g, " ");
    origin = readMdDefinitionDocument(file, text.slice(0, parameterStart) + masked + text.slice(unfinishedEnd), undefined, false, options);
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
  const active = context.parameterStart !== undefined
    ? call.arguments.find(argument => argument.point === context.parameterStart)?.name ?? context.argumentName
    : undefined;
  const supplied = new Set(call.arguments.filter(argument => argument.point !== context.parameterStart).map(argument => argument.name));
  const activeIndex = signature.parameters.findIndex(parameter => parameter.name === active);
  const unsupplied = signature.parameters.filter(parameter => !supplied.has(parameter.name));
  unsupplied.sort((first, second) => Number(first.hasDefault) - Number(second.hasDefault));
  return {
    name: `md.${resolved.script.name}.${library.name}`,
    location: library.source.location,
    parameters: signature.parameters,
    activeParameter: activeIndex >= 0 ? activeIndex : Math.max(0, signature.parameters.findIndex(parameter => !supplied.has(parameter.name))),
    unsupplied,
    nameRange: context.nameRange,
  };
}
