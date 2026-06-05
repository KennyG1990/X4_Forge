import type { MDNode, PropertySchema } from '../types';

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

export function schemaAttributeToProperty(attr: SchemaAttribute): PropertySchema {
  const enumValues = attr.enumValues?.filter(Boolean) || [];
  const looksBoolean = /boolean/i.test(attr.type) || enumValues.every(v => v === 'true' || v === 'false');

  return {
    key: attr.name,
    label: attr.required ? `${attr.name} *` : attr.name,
    type: enumValues.length > 0 ? 'select' : looksBoolean ? 'boolean' : 'text',
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
    ? [{ id: 'out_next', name: 'Next Action', type: 'flow' as const }]
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
