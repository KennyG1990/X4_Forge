/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModWorkspace, MDNode, MDLink, NODE_TEMPLATES } from '../types';

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
    
    let currentX = 150;
    let currentY = 120;

    for (let i = 0; i < cuesList.length; i++) {
      const cue = cuesList[i];
      const name = cue.getAttribute("name") || `cue_${i}`;
      const instantiate = cue.getAttribute("instantiate") || "false";
      const namespace = cue.getAttribute("namespace") || "this";
      const state = cue.getAttribute("state") || "active";
      
      const cueId = `cue_${Date.now()}_${i}`;
      
      const cueNode: MDNode = {
        id: cueId,
        type: 'cue',
        label: cue.getAttribute("name") ? `Cue: ${cue.getAttribute("name")}` : 'Mission Cue',
        xmlTag: 'cue',
        x: currentX,
        y: currentY,
        properties: { name, instantiate, namespace, state },
        propertiesSchema: NODE_TEMPLATES[0].propertiesSchema,
        inputs: NODE_TEMPLATES[0].inputs,
        outputs: NODE_TEMPLATES[0].outputs
      };
      
      nodes.push(cueNode);
      
      // Conditions block parsing
      const conditions = cue.getElementsByTagName("conditions")[0];
      if (conditions) {
        const children = conditions.children;
        for (let j = 0; j < children.length; j++) {
          const child = children[j];
          const tag = child.tagName;
          const childId = `cond_event_${Date.now()}_${i}_${j}`;
          
          let nodeType: 'event' | 'condition' = 'event';
          let label = `Event: ${tag}`;
          let schemaIdx = NODE_TEMPLATES.findIndex(t => t.xmlTag === tag);
          
          if (tag === 'check_value') {
            nodeType = 'condition';
            label = 'Check: Wealth';
          }
          
          const template = NODE_TEMPLATES[schemaIdx !== -1 ? schemaIdx : 1];
          const props: Record<string, any> = {};
          
          if (tag === 'check_value') {
            props.value = child.getAttribute("value") || 'player.money';
            props.operator = child.getAttribute("operator") || 'ge';
            props.amount = Number(child.getAttribute("value2")) || 1000000;
          } else {
            for (let a = 0; a < child.attributes.length; a++) {
              const attr = child.attributes[a];
              props[attr.name] = attr.value;
            }
          }
          
          const conditionNode: MDNode = {
            id: childId,
            type: nodeType,
            label,
            xmlTag: tag,
            x: currentX - 100,
            y: currentY + 320 + (j * 150),
            properties: { ...template.properties, ...props },
            propertiesSchema: template.propertiesSchema,
            inputs: template.inputs,
            outputs: template.outputs
          };
          
          nodes.push(conditionNode);
          
          links.push({
            id: `link_cond_${Date.now()}_${i}_${j}`,
            sourceNodeId: cueId,
            sourcePortId: 'out_cond',
            targetNodeId: childId,
            targetPortId: 'in_cond'
          });
        }
      }
      
      // Actions block parsing
      const actions = cue.getElementsByTagName("actions")[0];
      if (actions) {
        const actionChildren = actions.children;
        let lastActionId = '';
        let actionCount = 0;
        
        for (let j = 0; j < actionChildren.length; j++) {
          const child = actionChildren[j];
          const tag = child.tagName;
          
          if (child.nodeType !== 1) continue;
          
          const actionId = `action_${Date.now()}_${i}_${j}`;
          let schemaIdx = NODE_TEMPLATES.findIndex(t => t.xmlTag === tag);
          if (schemaIdx === -1) continue;
          
          const template = NODE_TEMPLATES[schemaIdx];
          const props: Record<string, any> = {};
          
          if (tag === 'create_ship') {
            props.name = child.getAttribute("name") || '$EscortShip';
            props.macro = child.getAttribute("macro") || 'ship_arg_s_fighter_01_a_macro (Elite Vanguard)';
            props.faction = child.getAttribute("faction") || 'player';
            
            const space = child.getElementsByTagName("space")[0];
            if (space) {
              props.sector = space.getAttribute("object") || 'player.sector';
            }
            const pos = child.getElementsByTagName("position")[0];
            if (pos) {
              props.coords = `${pos.getAttribute("x") || 0},${pos.getAttribute("y") || 0},${pos.getAttribute("z") || 1000}`;
            }
          } else if (tag === 'create_station') {
            props.name = child.getAttribute("name") || '$Station';
            props.macro = child.getAttribute("macro") || 'station_arg_defense_01_macro (Defence Station)';
            props.faction = child.getAttribute("faction") || 'player';
            
            const space = child.getElementsByTagName("space")[0];
            if (space) {
              props.sector = space.getAttribute("sector") || 'player.sector';
            }
            const pos = child.getElementsByTagName("position")[0];
            if (pos) {
              props.coords = `${pos.getAttribute("x") || 5000},${pos.getAttribute("y") || 0},${pos.getAttribute("z") || 5000}`;
            }
          } else if (tag === 'reward_player') {
            props.money = Number(child.getAttribute("money")) || 250000;
            props.notification = child.getAttribute("notification") || 'true';
            
            const rep = child.getElementsByTagName("reputation")[0];
            if (rep) {
              props.faction = (rep.getAttribute("faction") || 'argon').replace('faction.', '');
              props.standing = rep.getAttribute("value") || '0.05';
            }
          } else {
            for (let a = 0; a < child.attributes.length; a++) {
              const attr = child.attributes[a];
              props[attr.name] = attr.value;
            }
          }
          
          const actionNode: MDNode = {
            id: actionId,
            type: 'action',
            label: template.label,
            xmlTag: tag,
            x: currentX + 380 * (actionCount + 1),
            y: currentY + 40,
            properties: { ...template.properties, ...props },
            propertiesSchema: template.propertiesSchema,
            inputs: template.inputs,
            outputs: template.outputs
          };
          
          nodes.push(actionNode);
          
          if (actionCount === 0) {
            links.push({
              id: `link_act_init_${Date.now()}_${i}_${j}`,
              sourceNodeId: cueId,
              sourcePortId: 'out_act',
              targetNodeId: actionId,
              targetPortId: 'in_act'
            });
          } else if (lastActionId) {
            links.push({
              id: `link_act_next_${Date.now()}_${i}_${j}`,
              sourceNodeId: lastActionId,
              sourcePortId: 'out_next',
              targetNodeId: actionId,
              targetPortId: 'in_act'
            });
          }
          
          lastActionId = actionId;
          actionCount++;
        }
      }
      
      currentY += 580;
    }
    
    return {
      id: `workspace_${Date.now()}`,
      name: modName,
      version: "1.0.0",
      author: "ImportedAuthor",
      description: `Imported and visually reconstructed with ${nodes.length} nodes and ${links.length} connections.`,
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
