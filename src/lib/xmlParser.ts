/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModWorkspace, MDNode, MDLink, NODE_TEMPLATES, X4_SHIP_MACROS, X4_STATION_MACROS } from '../types';

let schemaTemplatesByTag = new Map<string, Omit<MDNode, 'id' | 'x' | 'y'>>();

export function setSchemaTemplatesForImport(templates: Omit<MDNode, 'id' | 'x' | 'y'>[]) {
  schemaTemplatesByTag = new Map((templates || []).map(template => [template.xmlTag, template]));
}

function attributesToProperties(element: Element): Record<string, any> {
  return Array.from(element.attributes).reduce<Record<string, any>>((props, attr) => {
    props[attr.name] = attr.value;
    return props;
  }, {});
}

// Parser: Egosoft XML script mapping to visual flowchart nodegraph
export function parseXMLToWorkspace(xmlText: string): ModWorkspace | null {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    const parserError = xmlDoc.getElementsByTagName("parsererror");
    if (parserError.length > 0) {
      throw new Error("Malformatted XML script syntax.");
    }

    const mdscript = xmlDoc.getElementsByTagName("mdscript")[0];
    if (!mdscript) {
      throw new Error("Missing main root <mdscript> node.");
    }

    const modName = mdscript.getAttribute("name") || "Parsed_X4_Mod";
    const cuesList = xmlDoc.getElementsByTagName("cue");
    
    const nodes: MDNode[] = [];
    const links: MDLink[] = [];
    
    const elementToId = new Map<Element, string>();
    const cueDepth = new Map<Element, number>();
    const depthCounts = new Map<number, number>();
    
    function getDepth(el: Element): number {
      if (cueDepth.has(el)) return cueDepth.get(el)!;
      let depth = 0;
      let parent = el.parentElement;
      while (parent) {
        if (parent.tagName === "cue") {
          depth += 1;
        }
        parent = parent.parentElement;
      }
      cueDepth.set(el, depth);
      return depth;
    }

    const serializer = new XMLSerializer();

    // Pass 1: Parse all cues
    for (let i = 0; i < cuesList.length; i++) {
      const cue = cuesList[i];
      const name = cue.getAttribute("name") || `cue_${i}`;
      const instantiate = cue.getAttribute("instantiate") || "false";
      const namespace = cue.getAttribute("namespace") || "this";
      const state = cue.getAttribute("state") || "active";
      
      const cueId = `cue_${Date.now()}_${i}`;
      elementToId.set(cue, cueId);
      
      const depth = getDepth(cue);
      const count = depthCounts.get(depth) || 0;
      depthCounts.set(depth, count + 1);
      
      // Separate Cues widely to prevent overlap (since we have flowchart nodes inside)
      const x = 100 + depth * 1500;
      const y = 80 + count * 450;

      const cueNode: MDNode = {
        id: cueId,
        type: 'cue',
        label: cue.getAttribute("name") ? `Cue: ${cue.getAttribute("name")}` : 'Mission Cue',
        xmlTag: 'cue',
        x,
        y,
        properties: { name, instantiate, namespace, state },
        propertiesSchema: NODE_TEMPLATES[0].propertiesSchema,
        inputs: NODE_TEMPLATES[0].inputs,
        outputs: NODE_TEMPLATES[0].outputs
      };
      
      nodes.push(cueNode);
    }
    
    // Pass 2: Reconstruct parent-child cue links (out_sub ➔ in_flow)
    for (let i = 0; i < cuesList.length; i++) {
      const cue = cuesList[i];
      const cueId = elementToId.get(cue);
      if (!cueId) continue;
      
      const parentCuesBlock = cue.parentElement;
      if (parentCuesBlock && parentCuesBlock.tagName === "cues") {
        const parentCueElement = parentCuesBlock.parentElement;
        if (parentCueElement && parentCueElement.tagName === "cue") {
          const parentCueId = elementToId.get(parentCueElement);
          if (parentCueId) {
            links.push({
              id: `link_sub_${Date.now()}_${parentCueId}_${cueId}`,
              sourceNodeId: parentCueId,
              sourcePortId: 'out_sub',
              targetNodeId: cueId,
              targetPortId: 'in_flow'
            });
          }
        }
      }
    }

    // Pass 3: Parse conditions and actions for each cue
    for (let i = 0; i < cuesList.length; i++) {
      const cue = cuesList[i];
      const cueId = elementToId.get(cue);
      if (!cueId) continue;
      const cueNode = nodes.find(n => n.id === cueId)!;

      // Parse conditions
      const conditionsElement = Array.from(cue.children).find(c => c.tagName === "conditions");
      if (conditionsElement) {
        const conditionChildren = Array.from(conditionsElement.children);
        let condIndex = 0;
        conditionChildren.forEach(child => {
          const tag = child.tagName;
          let nodeType: MDNode['type'] = 'condition';
          let xmlTag = tag;
          let label = tag;
          let properties: Record<string, any> = {};

          if (tag === 'event_cue_signalled') {
            nodeType = 'event';
            label = 'Event: Game Started';
            properties = { cue: child.getAttribute("cue") || 'md.Setup.Start' };
          } else if (tag === 'event_object_destroyed') {
            nodeType = 'event';
            label = 'Event: Object Destroyed';
            const faction = (child.getAttribute("faction") || 'any').replace('faction.', '');
            properties = { object: child.getAttribute("object") || 'player.target', faction };
          } else if (tag === 'event_object_changed_sector') {
            nodeType = 'event';
            label = 'Event: Sector Entered';
            properties = { object: child.getAttribute("object") || 'playership', sector: child.getAttribute("sector") || 'player.sector' };
          } else if (tag === 'check_value') {
            nodeType = 'condition';
            label = 'Check: Player Wealth';
            properties = {
              value: child.getAttribute("value") || 'player.money',
              operator: child.getAttribute("operator") || 'ge',
              amount: Number(child.getAttribute("value2")) || 1000000
            };
          } else {
            // Unrecognized / escape hatch
            const schemaTemplate = schemaTemplatesByTag.get(tag);
            if (schemaTemplate) {
              nodeType = schemaTemplate.type;
              xmlTag = schemaTemplate.xmlTag;
              label = schemaTemplate.label;
              properties = attributesToProperties(child);
            } else {
              if (tag.startsWith('event_')) {
                nodeType = 'event';
                xmlTag = 'custom_event';
                label = 'Custom XML Event';
              } else {
                nodeType = 'condition';
                xmlTag = 'custom_condition';
                label = 'Custom XML Condition';
              }
              properties = { rawXml: serializer.serializeToString(child) };
            }
          }

          const template = NODE_TEMPLATES.find(t => t.xmlTag === xmlTag) || schemaTemplatesByTag.get(xmlTag);
          if (template) {
            const condNodeId = `${xmlTag}_${Date.now()}_${i}_${condIndex}`;
            const condNode: MDNode = {
              id: condNodeId,
              type: nodeType,
              label,
              xmlTag,
              x: cueNode.x + 300,
              y: cueNode.y + condIndex * 150,
              properties,
              propertiesSchema: template.propertiesSchema,
              inputs: template.inputs,
              outputs: template.outputs
            };
            nodes.push(condNode);

            // Connect Cue -> Condition
            links.push({
              id: `link_cond_${Date.now()}_${cueId}_${condNodeId}`,
              sourceNodeId: cueId,
              sourcePortId: 'out_cond',
              targetNodeId: condNodeId,
              targetPortId: 'in_cond'
            });

            condIndex++;
          }
        });
      }

      // Parse actions
      const actionsElement = Array.from(cue.children).find(c => c.tagName === "actions");
      if (actionsElement) {
        const actionChildren = Array.from(actionsElement.children);
        let prevActionId = cueId;
        let prevPortId = 'out_act';
        let actIndex = 0;

        actionChildren.forEach(child => {
          const tag = child.tagName;
          let xmlTag = tag;
          let label = tag;
          let properties: Record<string, any> = {};

          if (tag === 'create_ship') {
            label = 'Spawn Ship';
            const name = child.getAttribute("name") || '$EscortShip';
            const faction = child.getAttribute("faction") || 'player';
            const macroVal = child.getAttribute("macro") || '';
            const matchingMacro = X4_SHIP_MACROS.find(m => m.startsWith(macroVal)) || macroVal;
            const spaceObj = child.getElementsByTagName("space")[0]?.getAttribute("object") || 'player.sector';
            const posEl = child.getElementsByTagName("position")[0];
            const coords = posEl ? `${posEl.getAttribute("x") || 0},${posEl.getAttribute("y") || 0},${posEl.getAttribute("z") || 0}` : '0,0,1000';
            properties = { name, macro: matchingMacro, faction, sector: spaceObj, coords };
          } else if (tag === 'reward_player') {
            label = 'Reward Player';
            const money = Number(child.getAttribute("money")) || 0;
            const notification = child.getAttribute("notification") || 'true';
            const repEl = child.getElementsByTagName("reputation")[0];
            const standing = repEl ? repEl.getAttribute("value") || '0.0' : '';
            const faction = repEl ? (repEl.getAttribute("faction") || 'argon').replace('faction.', '') : '';
            properties = { money, notification, standing, faction };
          } else if (tag === 'play_sound') {
            label = 'Play Audio/Sound';
            properties = {
              object: child.getAttribute("object") || 'playership',
              sound: child.getAttribute("sound") || 'notification_generic'
            };
          } else if (tag === 'show_help') {
            label = 'Show Briefing';
            const rawText = child.getAttribute("text") || '';
            const text = rawText.replace(/^'|'$/g, '');
            properties = { text, duration: Number(child.getAttribute("duration")) || 5 };
          } else if (tag === 'create_station') {
            label = 'Spawn Station';
            const name = child.getAttribute("name") || '$MyDefenseStation';
            const faction = child.getAttribute("faction") || 'player';
            const macroVal = child.getAttribute("macro") || '';
            const matchingMacro = X4_STATION_MACROS.find(m => m.startsWith(macroVal)) || macroVal;
            const spaceObj = child.getElementsByTagName("space")[0]?.getAttribute("sector") || 'player.sector';
            const posEl = child.getElementsByTagName("position")[0];
            const coords = posEl ? `${posEl.getAttribute("x") || 0},${posEl.getAttribute("y") || 0},${posEl.getAttribute("z") || 0}` : '5000,0,5000';
            properties = { name, macro: matchingMacro, faction, sector: spaceObj, coords };
          } else {
            // Unrecognized / escape hatch
            const schemaTemplate = schemaTemplatesByTag.get(tag);
            if (schemaTemplate) {
              xmlTag = schemaTemplate.xmlTag;
              label = schemaTemplate.label;
              properties = attributesToProperties(child);
            } else {
              xmlTag = 'custom_xml';
              label = 'Custom XML Action';
              properties = { rawXml: serializer.serializeToString(child) };
            }
          }

          const template = NODE_TEMPLATES.find(t => t.xmlTag === xmlTag) || schemaTemplatesByTag.get(xmlTag);
          if (template) {
            const actNodeId = `${xmlTag}_${Date.now()}_${i}_${actIndex}`;
            const actNode: MDNode = {
              id: actNodeId,
              type: 'action',
              label,
              xmlTag,
              x: cueNode.x + 600 + actIndex * 300,
              y: cueNode.y,
              properties,
              propertiesSchema: template.propertiesSchema,
              inputs: template.inputs,
              outputs: template.outputs
            };
            nodes.push(actNode);

            // Connect previous node to this action
            links.push({
              id: `link_act_${Date.now()}_${prevActionId}_${actNodeId}`,
              sourceNodeId: prevActionId,
              sourcePortId: prevPortId,
              targetNodeId: actNodeId,
              targetPortId: 'in_act'
            });

            prevActionId = actNodeId;
            prevPortId = 'out_next';
            actIndex++;
          }
        });
      }
    }
    
    return {
      id: `workspace_${Date.now()}`,
      name: modName,
      version: mdscript.getAttribute("version") || "1.0.0",
      author: mdscript.getAttribute("author") || "ImportedAuthor",
      description: mdscript.getAttribute("description") || `Imported and visually reconstructed with ${nodes.length} cue nodes.`,
      nodes,
      links,
      uiWidgets: [],
      uiTheme: {
        backgroundColor: "#0F1115",
        borderColor: "#06b6d4",
        accentColor: "#0891b2",
        opacity: 0.95,
        showIcons: true
      }
    };
  } catch (err: any) {
    console.warn("XML Import Parsing Error: ", err);
    return null;
  }
}
