/** Authoritative expression-valued attribute roles shared by validation and editor navigation. */
export interface ScriptAttributeType {
  type?: string;
  baseType?: string;
}

const EXPRESSION_TYPE = /^(?:\w+:)?(?:lvalue|boolean)?expression$/i;

export function isScriptExpressionRole(element: string, attribute: string, spec?: ScriptAttributeType): boolean {
  return (element === 'set_value' && attribute === 'exact')
    || (element === 'debug_text' && attribute === 'text')
    || (element === 'do_if' && attribute === 'value')
    || (typeof spec?.type === 'string' && EXPRESSION_TYPE.test(spec.type))
    || (typeof spec?.baseType === 'string' && EXPRESSION_TYPE.test(spec.baseType));
}
