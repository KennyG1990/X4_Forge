import type { MDNode, PropertySchema } from '../types';
import { isContainerTag } from './portSemantics';

export type SchemaCategory = 'event' | 'condition' | 'action' | 'control_flow';

export interface SchemaAttribute {
  name: string;
  type: string;
  required: boolean;
  documentation: string;
  enumValues?: string[];
  defaultValue?: string;
}

export interface SchemaElement {
  tag: string;
  category: SchemaCategory;
  documentation: string;
  attributes: SchemaAttribute[];
  childElements?: Pick<SchemaElement, 'tag' | 'category' | 'documentation'>[];
  sourceFile?: string;
}

export interface SchemaLibrary {
  events: SchemaElement[];
  conditions: SchemaElement[];
  actions: SchemaElement[];
  controlFlow: SchemaElement[];
  simpleTypes: Record<string, string[]>;
  templates: Omit<MDNode, 'id' | 'x' | 'y'>[];
  sourceFiles: string[];
  loaded: boolean;
  error?: string;
}

/**
 * Map an MD attribute to a live object-index picker kind, by attribute name.
 * Conservative whitelist: only attributes that clearly reference *static game
 * data* (factions, wares, macros, sounds) — NOT runtime refs like object/cue/
 * entity/group, which aren't object-index kinds. md.xsd types most attributes
 * as `expression`, so name-based inference is more reliable than type-based.
 * Inference is non-destructive: the picker still accepts free text, so MD
 * variables (`$ship`, `player.ship`) remain valid in these fields.
 */
const REF_ATTR_KINDS: Record<string, NonNullable<PropertySchema['refKind']>> = {
  faction: 'faction',
  ware: 'ware',
  macro: 'macro',
  sound: 'sound',
  soundlibrary: 'sound'
};

function inferRefKind(attr: SchemaAttribute): PropertySchema['refKind'] | undefined {
  const name = attr.name.toLowerCase();
  if (REF_ATTR_KINDS[name]) return REF_ATTR_KINDS[name];
  if (name.endsWith('faction')) return 'faction';   // e.g. defaultfaction, ownerfaction
  return undefined;
}

export function schemaAttributeToProperty(attr: SchemaAttribute): PropertySchema {
  const enumValues = attr.enumValues?.filter(Boolean) || [];
  const looksBoolean = /boolean/i.test(attr.type) || (enumValues.length > 0 && enumValues.every(v => v === 'true' || v === 'false'));
  // Only infer a reference picker for free/expression fields — never override a
  // fixed enum (keep its dropdown) or a boolean.
  const refKind = enumValues.length === 0 && !looksBoolean ? inferRefKind(attr) : undefined;

  return {
    key: attr.name,
    label: attr.required ? `${attr.name} *` : attr.name,
    type: refKind ? 'reference' : enumValues.length > 0 ? 'select' : looksBoolean ? 'boolean' : 'text',
    refKind,
    required: attr.required,
    options: enumValues.length > 0 ? enumValues : looksBoolean ? ['true', 'false'] : undefined,
    placeholder: attr.type || attr.name,
    description: attr.documentation || `${attr.type}${attr.required ? ' (required)' : ''}`
  };
}

export function schemaElementToTemplate(element: SchemaElement): Omit<MDNode, 'id' | 'x' | 'y'> {
  const type: MDNode['type'] = element.category === 'event'
    ? 'event'
    : element.category === 'condition'
      ? 'condition'
      : 'action';

  const inputs = type === 'action'
    ? [{ id: 'in_act', name: 'Action In', type: 'child' as const }]
    : [{ id: 'in_cond', name: 'Condition In', type: 'child' as const }];

  const outputs = type === 'action'
    ? [
        { id: 'out_next', name: 'Next Action', type: 'flow' as const },
        // Control-flow containers (do_if, do_while, …) get a dedicated BODY port so the
        // actions inside the branch are structurally distinct from the next sibling.
        ...(isContainerTag(element.tag) ? [{ id: 'out_body', name: 'Branch Body', type: 'child' as const }] : []),
      ]
    : [{ id: 'out_flow', name: type === 'event' ? 'Trigger Actions' : 'Passed Flow', type: 'flow' as const }];

  const properties = Object.fromEntries(
    element.attributes
      .filter(attr => attr.defaultValue !== undefined)
      .map(attr => [attr.name, attr.defaultValue])
  );

  return {
    type,
    label: element.tag,
    xmlTag: element.tag,
    properties,
    propertiesSchema: element.attributes.map(schemaAttributeToProperty),
    inputs,
    outputs,
    comment: element.documentation
  };
}

export function schemaLibraryToTemplates(library: Pick<SchemaLibrary, 'events' | 'conditions' | 'actions' | 'controlFlow'>): Omit<MDNode, 'id' | 'x' | 'y'>[] {
  return [
    ...library.events,
    ...library.conditions,
    ...library.actions,
    ...library.controlFlow
  ].map(schemaElementToTemplate);
}
