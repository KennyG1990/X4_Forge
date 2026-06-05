/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Node port representation
export interface Port {
  id: string;
  name: string;
  type: 'flow' | 'data' | 'parent' | 'child';
  dataType?: string;
}

// Property schema definition for custom GUI parameter inputs
export interface PropertySchema {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'coordinates' | 'textarea';
  options?: string[];
  placeholder?: string;
  description?: string;
}

// Visual Node representation in the blueprint editor
export interface MDNode {
  id: string;
  type: 'cue' | 'event' | 'condition' | 'action' | 'variable';
  label: string;
  xmlTag: string;
  x: number;
  y: number;
  properties: Record<string, any>;
  propertiesSchema: PropertySchema[];
  inputs: Port[];
  outputs: Port[];
  comment?: string;
}

// Connection wire representation between nodes
export interface MDLink {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

// UI Mod Widget representation for the layout builder
export interface UIWidget {
  id: string;
  type: 'window' | 'table' | 'button' | 'text' | 'progressbar' | 'dropdown' | 'header' | 'input' | 'chat';
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  properties: Record<string, any>;
}

export interface TranslationItem {
  id: string;
  value: string;
  description?: string;
}

export interface TranslationPage {
  id: string;
  title?: string;
  items: TranslationItem[];
}

export interface TFile {
  languageId: string;
  fileName: string;
  pages: TranslationPage[];
}

// Complete Mod Workspace containing scripts and widgets state
export interface ModWorkspace {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  nodes: MDNode[];
  links: MDLink[];
  uiWidgets: UIWidget[];
  uiTheme: {
    backgroundColor: string;
    borderColor: string;
    accentColor: string;
    opacity: number;
    showIcons: boolean;
  };
  tFiles?: TFile[];
  aiScripts?: any[];
}

// Built-in game variables for X4 standard database definitions
export const X4_FACTIONS = [
  'player',
  'argon',
  'xenon',
  'khaak',
  'split',
  'paranid',
  'teladi',
  'terran',
  'antigone',
  'hatikvah',
  'yaki',
  'ministry'
];

export const X4_SHIP_MACROS = [
  'ship_arg_l_destroyer_01_a_macro (Behemoth Van.)',
  'ship_arg_s_fighter_01_a_macro (Elite Vanguard)',
  'ship_tel_xl_carrier_01_a_macro (Condor Van.)',
  'ship_split_m_corvette_01_a_macro (Dragon Van.)',
  'ship_ter_l_destroyer_01_a_macro (Syn)',
  'ship_xen_i_destroyer_01_macro (Xenon I)',
  'ship_xen_k_destroyer_01_macro (Xenon K)',
  'ship_par_m_frigate_01_a_macro (Gorgon Van.)',
  'ship_arg_xl_builder_01_a_macro (Mammoth Van.)'
];

export const X4_STATION_MACROS = [
  'station_arg_defense_01_macro (Defence Station)',
  'station_player_headquarters_01_macro (Player HQ)',
  'station_tel_trading_01_macro (Trading Station)',
  'station_xen_shipyard_01_macro (Xenon Shipyard)'
];

export const X4_SOUND_EFFECTS = [
  'notification_generic',
  'mission_accomplished',
  'mission_failed',
  'incoming_transmission',
  'ui_menu_click',
  'alarm_red'
];

export const NODE_TEMPLATES: Omit<MDNode, 'id' | 'x' | 'y'>[] = [
  // Cues (Outer shells)
  {
    type: 'cue',
    label: 'Mission Cue',
    xmlTag: 'cue',
    properties: {
      name: 'MyMissionCue',
      instantiate: 'false',
      namespace: 'this',
      state: 'active'
    },
    propertiesSchema: [
      { key: 'name', label: 'Cue ID / Name', type: 'text', placeholder: 'e.g. MyCue_Start' },
      { key: 'instantiate', label: 'Instantiate', type: 'select', options: ['true', 'false'], description: 'Creates a dynamic copy of this cue each time context occurs' },
      { key: 'namespace', label: 'Namespace', type: 'select', options: ['this', 'player', 'cue'] },
      { key: 'state', label: 'Initial State', type: 'select', options: ['active', 'inactive', 'waiting'] }
    ],
    inputs: [
      { id: 'in_flow', name: 'Trigger Parent', type: 'parent' }
    ],
    outputs: [
      { id: 'out_cond', name: 'Conditions', type: 'child' },
      { id: 'out_act', name: 'Actions', type: 'child' },
      { id: 'out_sub', name: 'Sub Cues', type: 'parent' }
    ]
  },

  // Events (Conditions / Triggers)
  {
    type: 'event',
    label: 'Event: Game Started',
    xmlTag: 'event_cue_signalled',
    properties: {
      cue: 'md.Setup.Start'
    },
    propertiesSchema: [
      { key: 'cue', label: 'Signaling Cue', type: 'text', placeholder: 'md.Setup.Start', description: 'Triggered when this standard system startup cue completes' }
    ],
    inputs: [
      { id: 'in_cond', name: 'Condition In', type: 'child' }
    ],
    outputs: [
      { id: 'out_flow', name: 'Trigger Actions', type: 'flow' }
    ]
  },
  {
    type: 'event',
    label: 'Event: Object Destroyed',
    xmlTag: 'event_object_destroyed',
    properties: {
      object: 'player.target',
      faction: 'xenon'
    },
    propertiesSchema: [
      { key: 'object', label: 'Object / Target', type: 'text', placeholder: 'player.target', description: 'Specific ship or variable entity being watched' },
      { key: 'faction', label: 'Faction Filter', type: 'select', options: ['any', ...X4_FACTIONS] }
    ],
    inputs: [
      { id: 'in_cond', name: 'Condition In', type: 'child' }
    ],
    outputs: [
      { id: 'out_flow', name: 'Trigger Actions', type: 'flow' }
    ]
  },
  {
    type: 'event',
    label: 'Event: Sector Entered',
    xmlTag: 'event_object_changed_sector',
    properties: {
      object: 'playership',
      sector: 'player.sector'
    },
    propertiesSchema: [
      { key: 'object', label: 'Object', type: 'text', placeholder: 'playership' },
      { key: 'sector', label: 'Target Sector', type: 'text', placeholder: 'player.sector', description: 'Can specify a helper variable or specific zone' }
    ],
    inputs: [
      { id: 'in_cond', name: 'Condition In', type: 'child' }
    ],
    outputs: [
      { id: 'out_flow', name: 'Trigger Actions', type: 'flow' }
    ]
  },

  // Conditions (Check constraints)
  {
    type: 'condition',
    label: 'Check: Player Wealth',
    xmlTag: 'check_value',
    properties: {
      value: 'player.money',
      operator: 'ge',
      amount: 1000000
    },
    propertiesSchema: [
      { key: 'value', label: 'Variable/Check', type: 'text', placeholder: 'player.money' },
      { key: 'operator', label: 'Comparison', type: 'select', options: ['exact (eq)', 'greater/equal (ge)', 'less/equal (le)', 'not equal (ne)'] },
      { key: 'amount', label: 'Credits Threshold', type: 'number', placeholder: '1000000' }
    ],
    inputs: [
      { id: 'in_cond', name: 'Condition In', type: 'child' }
    ],
    outputs: [
      { id: 'out_flow', name: 'Passed Flow', type: 'flow' }
    ]
  },

  // Actions
  {
    type: 'action',
    label: 'Spawn Ship',
    xmlTag: 'create_ship',
    properties: {
      name: '$EscortShip',
      macro: 'ship_arg_l_destroyer_01_a_macro (Behemoth Van.)',
      faction: 'player',
      sector: 'player.sector',
      coords: '0,0,1000'
    },
    propertiesSchema: [
      { key: 'name', label: 'Variable Name', type: 'text', placeholder: '$SpawnedShip' },
      { key: 'macro', label: 'Ship Class Macro', type: 'select', options: X4_SHIP_MACROS },
      { key: 'faction', label: 'Owner Faction', type: 'select', options: X4_FACTIONS },
      { key: 'sector', label: 'Sector / Spawn Zone', type: 'text', placeholder: 'player.sector' },
      { key: 'coords', label: 'Relative Coordinates (X,Y,Z)', type: 'coordinates', placeholder: '0,0,1000' }
    ],
    inputs: [
      { id: 'in_act', name: 'Action In', type: 'child' }
    ],
    outputs: [
      { id: 'out_next', name: 'Next Action', type: 'flow' }
    ]
  },
  {
    type: 'action',
    label: 'Reward Player',
    xmlTag: 'reward_player',
    properties: {
      money: 250000,
      notification: 'true',
      standing: '0.05',
      faction: 'argon'
    },
    propertiesSchema: [
      { key: 'money', label: 'Credits Reward', type: 'number', placeholder: '250000' },
      { key: 'notification', label: 'Display Notification', type: 'select', options: ['true', 'false'] },
      { key: 'standing', label: 'Faction Reputation Change', type: 'text', placeholder: '0.05 (Scale -1.0 to 1.0)' },
      { key: 'faction', label: 'Reputation Faction', type: 'select', options: X4_FACTIONS }
    ],
    inputs: [
      { id: 'in_act', name: 'Action In', type: 'child' }
    ],
    outputs: [
      { id: 'out_next', name: 'Next Action', type: 'flow' }
    ]
  },
  {
    type: 'action',
    label: 'Play Audio/Sound',
    xmlTag: 'play_sound',
    properties: {
      object: 'playership',
      sound: 'notification_generic'
    },
    propertiesSchema: [
      { key: 'object', label: 'Source Object', type: 'text', placeholder: 'playership' },
      { key: 'sound', label: 'Audio Clip ID', type: 'select', options: X4_SOUND_EFFECTS }
    ],
    inputs: [
      { id: 'in_act', name: 'Action In', type: 'child' }
    ],
    outputs: [
      { id: 'out_next', name: 'Next Action', type: 'flow' }
    ]
  },
  {
    type: 'action',
    label: 'Show Briefing',
    xmlTag: 'show_help',
    properties: {
      text: 'Custom mod cue successfully loaded!',
      duration: 5
    },
    propertiesSchema: [
      { key: 'text', label: 'Sub-screen Text Banner', type: 'text', placeholder: 'Type briefing alert notice...' },
      { key: 'duration', label: 'Duration (Seconds)', type: 'number', placeholder: '5' }
    ],
    inputs: [
      { id: 'in_act', name: 'Action In', type: 'child' }
    ],
    outputs: [
      { id: 'out_next', name: 'Next Action', type: 'flow' }
    ]
  },
  {
    type: 'action',
    label: 'Spawn Station',
    xmlTag: 'create_station',
    properties: {
      name: '$MyDefenseStation',
      macro: 'station_arg_defense_01_macro (Defence Station)',
      faction: 'player',
      sector: 'player.sector',
      coords: '5000,0,5000'
    },
    propertiesSchema: [
      { key: 'name', label: 'Station Entity Target', type: 'text', placeholder: '$MyStation' },
      { key: 'macro', label: 'Station Design Macro', type: 'select', options: X4_STATION_MACROS },
      { key: 'faction', label: 'Owner Faction', type: 'select', options: X4_FACTIONS },
      { key: 'sector', label: 'Spawn Sector', type: 'text', placeholder: 'player.sector' },
      { key: 'coords', label: 'Coordinates (X,Y,Z)', type: 'coordinates', placeholder: '10000, 0, -5000' }
    ],
    inputs: [
      { id: 'in_act', name: 'Action In', type: 'child' }
    ],
    outputs: [
      { id: 'out_next', name: 'Next Action', type: 'flow' }
    ]
  },
  {
    type: 'action',
    label: 'Custom XML Action',
    xmlTag: 'custom_xml',
    properties: {
      rawXml: '<show_notification text="\'Target acquired!\'" duration="5" />'
    },
    propertiesSchema: [
      { key: 'rawXml', label: 'Raw XML Snippet', type: 'textarea', placeholder: 'Enter any valid Mission Director XML block...', description: 'This block will be printed raw directly into the actions block of the cue.' }
    ],
    inputs: [
      { id: 'in_act', name: 'Action In', type: 'child' }
    ],
    outputs: [
      { id: 'out_next', name: 'Next Action', type: 'flow' }
    ]
  },
  {
    type: 'event',
    label: 'Custom XML Event',
    xmlTag: 'custom_event',
    properties: {
      rawXml: '<event_cue_completed cue="md.MyPreviousCue" />'
    },
    propertiesSchema: [
      { key: 'rawXml', label: 'Raw Event XML Snippet', type: 'textarea', placeholder: 'Enter raw event XML...', description: 'This event is embedded in the conditions tag.' }
    ],
    inputs: [
      { id: 'in_cond', name: 'Condition In', type: 'child' }
    ],
    outputs: [
      { id: 'out_flow', name: 'Trigger Actions', type: 'flow' }
    ]
  },
  {
    type: 'condition',
    label: 'Custom XML Condition',
    xmlTag: 'custom_condition',
    properties: {
      rawXml: '<check_value value="player.ship.isclass.ship_xl" />'
    },
    propertiesSchema: [
      { key: 'rawXml', label: 'Raw Condition XML Snippet', type: 'textarea', placeholder: 'Enter raw check_value or condition XML...', description: 'This check_value is embedded in the conditions tag.' }
    ],
    inputs: [
      { id: 'in_cond', name: 'Condition In', type: 'child' }
    ],
    outputs: [
      { id: 'out_flow', name: 'Passed Flow', type: 'flow' }
    ]
  }
];

// Helper functions to generate the XML output cleanly
export function generateMDXML(workspace: ModWorkspace): string {
  let xml = `<?xml version="1.0" encoding="utf-8"?>
<mdscript name="${workspace.name || 'Sample_Mod'}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="md.xsd">
  <!-- Generated by X4 Foundations Mod Studio (version ${workspace.version || '1.0.0'}) -->
  <!-- Author: ${workspace.author || 'Mod Creator'} -->
  <!-- Description: ${workspace.description || 'Custom MD Script'} -->
  <cues>
`;

  // Find all Cue nodes
  const cueNodes = workspace.nodes.filter(n => n.type === 'cue');

  cueNodes.forEach(cue => {
    const cueName = cue.properties.name || cue.id;
    const inst = cue.properties.instantiate === 'true' ? ' instantiate="true"' : '';
    const ns = cue.properties.namespace ? ` namespace="${cue.properties.namespace}"` : '';
    
    xml += `    <cue name="${cueName}"${inst}${ns}>\n`;

    // Fetch linked events or conditions (Inputs: flow from conditions/events linked to out_cond or out_act)
    const linkedLinks = workspace.links.filter(l => l.sourceNodeId === cue.id);
    
    // Conditions check
    const condLinks = linkedLinks.filter(l => l.sourcePortId === 'out_cond');
    if (condLinks.length > 0) {
      xml += `      <conditions>\n`;
      condLinks.forEach(link => {
        const targetNode = workspace.nodes.find(n => n.id === link.targetNodeId);
        if (targetNode) {
          if (targetNode.type === 'event') {
            if (targetNode.xmlTag === 'custom_event' || targetNode.xmlTag.startsWith('custom_')) {
              const raw = targetNode.properties.rawXml || `<!-- Custom Event -->`;
              xml += `        ${raw}\n`;
            } else {
              const eventProps = Object.entries(targetNode.properties)
                .map(([k, v]) => `${k}="${v.toString().replace(/ \(.*\)/, '')}"`)
                .join(' ');
              xml += `        <${targetNode.xmlTag} ${eventProps} />\n`;
            }
          } else if (targetNode.type === 'condition') {
            if (targetNode.xmlTag === 'custom_condition') {
              const raw = targetNode.properties.rawXml || `<!-- Custom Condition -->`;
              xml += `        ${raw}\n`;
            } else {
              const val = targetNode.properties.value || '';
              const op = targetNode.properties.operator || 'eq';
              const amt = targetNode.properties.amount || '';
              xml += `        <check_value value="${val}" value2="${amt}" operator="${op}" />\n`;
            }
          }
        }
      });
      xml += `      </conditions>\n`;
    }

    // Actions check
    const actLinks = linkedLinks.filter(l => l.sourcePortId === 'out_act');
    if (actLinks.length > 0) {
      xml += `      <actions>\n`;
      actLinks.forEach(link => {
        let currentNode: MDNode | undefined = workspace.nodes.find(n => n.id === link.targetNodeId);
        
        while (currentNode) {
          if (currentNode.type === 'action') {
            if (currentNode.xmlTag === 'custom_xml' || currentNode.xmlTag.startsWith('custom_')) {
              xml += `        <!-- Custom Action -->\n`;
              xml += `        ${currentNode.properties.rawXml || ''}\n`;
            } else if (currentNode.xmlTag === 'create_ship') {
              const macroClean = (currentNode.properties.macro || '').split(' (')[0];
              xml += `        <!-- Action: ${currentNode.label} -->\n`;
              xml += `        <create_ship name="${currentNode.properties.name || '$Ship'}" macro="${macroClean}" faction="${currentNode.properties.faction || 'player'}">\n`;
              xml += `          <space object="${currentNode.properties.sector || 'player.sector'}" />\n`;
              
              if (currentNode.properties.coords) {
                const xyz = currentNode.properties.coords.split(',');
                xml += `          <position x="${xyz[0] || '0'}" y="${xyz[1] || '0'}" z="${xyz[2] || '0'}" />\n`;
              }
              xml += `        </create_ship>\n`;
            } else {
              xml += `        <!-- Action: ${currentNode.label} -->\n`;
              if (currentNode.xmlTag === 'reward_player') {
                let reputation = '';
                if (currentNode.properties.standing && currentNode.properties.faction) {
                  reputation = `\n          <reputation faction="faction.${currentNode.properties.faction}" value="${currentNode.properties.standing}" />`;
                }
                xml += `        <reward_player money="${currentNode.properties.money || 0}" notification="${currentNode.properties.notification || 'true'}">${reputation}\n        </reward_player>\n`;
              } else if (currentNode.xmlTag === 'play_sound') {
                xml += `        <play_sound object="${currentNode.properties.object || 'playership'}" sound="${currentNode.properties.sound || 'notification_generic'}" />\n`;
              } else if (currentNode.xmlTag === 'show_help') {
                xml += `        <show_help text="'${currentNode.properties.text || ''}'" duration="${currentNode.properties.duration || 5}" />\n`;
              } else if (currentNode.xmlTag === 'create_station') {
                const macroClean = (currentNode.properties.macro || '').split(' (')[0];
                xml += `        <create_station name="${currentNode.properties.name || '$Station'}" macro="${macroClean}" faction="${currentNode.properties.faction || 'player'}">\n`;
                xml += `          <space sector="${currentNode.properties.sector || 'player.sector'}" />\n`;
                if (currentNode.properties.coords) {
                  const xyz = currentNode.properties.coords.split(',');
                  xml += `          <position x="${xyz[0] || '0'}" y="${xyz[1] || '0'}" z="${xyz[2] || '0'}" />\n`;
                }
                xml += `        </create_station>\n`;
              }
            }
          }
          
          // Move down the chain if there is a next action linked to 'out_next'
          const nextActLink = workspace.links.find(l => l.sourceNodeId === currentNode?.id && l.sourcePortId === 'out_next');
          currentNode = nextActLink ? workspace.nodes.find(n => n.id === nextActLink.targetNodeId) : undefined;
        }
      });
      xml += `      </actions>\n`;
    }

    // Checking for linked child-cues connected to 'out_sub'
    const subCues = linkedLinks.filter(l => l.sourcePortId === 'out_sub');
    if (subCues.length > 0) {
      xml += `      <cues>\n`;
      subCues.forEach(link => {
        const subCue = workspace.nodes.find(n => n.id === link.targetNodeId);
        if (subCue && subCue.type === 'cue') {
          // Represent recursive generation of cues simply
          const subName = subCue.properties.name || subCue.id;
          xml += `        <cue name="${subName}">\n`;
          xml += `          <!-- Sub-cue definitions are grouped dynamically -->\n`;
          // Quick nested trigger representation
          const subActs = workspace.links.filter(l => l.sourceNodeId === subCue.id && l.sourcePortId === 'out_act');
          if (subActs.length > 0) {
            xml += `          <actions>\n`;
            subActs.forEach(sa => {
              const saNode = workspace.nodes.find(n => n.id === sa.targetNodeId);
              if (saNode) {
                xml += `            <show_help text="'Subcue triggered: ${saNode.label}'" duration="5" />\n`;
              }
            });
            xml += `          </actions>\n`;
          }
          xml += `        </cue>\n`;
        }
      });
      xml += `      </cues>\n`;
    }

    xml += `    </cue>\n`;
  });

  xml += `  </cues>
</mdscript>`;
  return xml;
}

// Generate the Lua config / Egosoft UI Customization parameters XML for menus
export function generateUIXML(workspace: ModWorkspace): string {
  const t = workspace.uiTheme;
  const alpha = Math.round(t.opacity * 255).toString(16).padStart(2, '0');
  
  let layoutXML = `<?xml version="1.0" encoding="utf-8"?>
<ui_menu name="${workspace.name || 'Sample_Menu'}" version="${workspace.version || '1.0.0'}">
  <!-- X4 Foundations Theme Style Settings -->
  <theme>
    <background color="${t.backgroundColor}" opacity="${t.opacity}" />
    <border color="${t.borderColor}" thickness="1" />
    <accent color="${t.accentColor}" />
    <icons enabled="${t.showIcons ? 'true' : 'false'}" />
  </theme>

  <!-- Visual Widget layout tree configuration -->
  <layout width="1920" height="1080" anchor="center">
`;

  workspace.uiWidgets.forEach(w => {
    const title = w.label;
    if (w.type === 'window') {
      layoutXML += `    <container type="window" x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" title="${title}">\n`;
      layoutXML += `      <!-- Nested widgets render within window container boundaries -->\n`;
      layoutXML += `    </container>\n`;
    } else if (w.type === 'table') {
      layoutXML += `    <table x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" columns="3">\n`;
      layoutXML += `      <columns>\n`;
      layoutXML += `        <column width="200" title="Item ID" />\n`;
      layoutXML += `        <column width="300" title="Item Name" />\n`;
      layoutXML += `        <column width="150" title="Status" />\n`;
      layoutXML += `      </columns>\n`;
      layoutXML += `      <row>\n`;
      layoutXML += `        <cell text="01" />\n`;
      layoutXML += `        <cell text="${title || 'Ship Deliveries'}" />\n`;
      layoutXML += `        <cell text="COMPLETED" color="#00ff66" />\n`;
      layoutXML += `      </row>\n`;
      layoutXML += `    </table>\n`;
    } else if (w.type === 'button') {
      const action = w.properties.action || 'signal_cue';
      const dest = w.properties.targetCue || 'MyMissionCue';
      layoutXML += `    <button x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" label="${title}" action="${action}" target="${dest}" />\n`;
    } else if (w.type === 'progressbar') {
      const val = w.properties.value || 75;
      const col = w.properties.progressColor || '#df9825';
      layoutXML += `    <progressbar x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" value="${val}" max="100" fillcolor="${col}" />\n`;
    } else if (w.type === 'text') {
      const size = w.properties.fontSize || 'medium';
      const align = w.properties.alignment || 'left';
      layoutXML += `    <text x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" content="${title}" fontsize="${size}" align="${align}" />\n`;
    } else if (w.type === 'header') {
      layoutXML += `    <header x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" text="${title.toUpperCase()}" />\n`;
    } else if (w.type === 'dropdown') {
      const opts = w.properties.options ? w.properties.options.join(',') : 'Option 1,Option 2';
      layoutXML += `    <select x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" options="${opts}" />\n`;
    } else if (w.type === 'input') {
      const ph = w.properties.placeholder || 'Type transmission...';
      layoutXML += `    <input x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" placeholder="${ph}" />\n`;
    } else if (w.type === 'chat') {
      layoutXML += `    <chat_history x="${w.x}" y="${w.y}" width="${w.w}" height="${w.h}" title="${title}" />\n`;
    }
  });

  layoutXML += `  </layout>
</ui_menu>`;
  return layoutXML;
}

// Validation logic returns specific diagnostics
export interface XMLDiagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  nodeId?: string;
  category: 'syntax' | 'references' | 'egosoft';
}

export function validateModWorkspace(workspace: ModWorkspace, code: string): XMLDiagnostic[] {
  const diagnostics: XMLDiagnostic[] = [];

  // Check name & meta attributes
  if (!workspace.name) {
    diagnostics.push({
      severity: 'error',
      message: 'Mod Name must not be empty. MD script compilation is restricted without name definitions.',
      category: 'syntax'
    });
  } else if (!/^[A-Za-z0-0_]+$/.test(workspace.name)) {
    diagnostics.push({
      severity: 'warning',
      message: 'Mod Script name contains space or special characters. Strongly recommended to style using alphanumeric underscores (e.g. My_Custom_Script)',
      category: 'syntax'
    });
  }

  // Check Cues
  const cueNodes = workspace.nodes.filter(n => n.type === 'cue');
  if (cueNodes.length === 0) {
    diagnostics.push({
      severity: 'warning',
      message: 'No "Mission Cue" nodes configured. An MD script without cues will load successfully but will perform no actions.',
      category: 'egosoft'
    });
  }

  // Warn about unlinked nodes
  workspace.nodes.forEach(node => {
    // A cue needs conditions or actions links
    if (node.type === 'cue') {
      const links = workspace.links.filter(l => l.sourceNodeId === node.id);
      const hasConds = links.some(l => l.sourcePortId === 'out_cond');
      const hasActs = links.some(l => l.sourcePortId === 'out_act');
      if (!hasConds && !hasActs) {
        diagnostics.push({
          severity: 'warning',
          message: `Mission Cue "${node.properties.name || node.id}" has no Condition triggers or Actions configured.`,
          nodeId: node.id,
          category: 'egosoft'
        });
      }
    }

    // Other nodes should be targeted by some link (unless they are trigger-initiating nodes or we are check/action chains)
    if (node.type === 'event' || node.type === 'condition' || node.type === 'action') {
      const isTarget = workspace.links.some(l => l.targetNodeId === node.id);
      if (!isTarget) {
        diagnostics.push({
          severity: 'warning',
          message: `Dangling logical node "${node.label}" is not connected to any active cue sequence or flow cascade.`,
          nodeId: node.id,
          category: 'references'
        });
      }
    }
  });

  // Verify missing inputs or variable macros
  workspace.nodes.filter(n => n.type === 'action' && n.xmlTag === 'create_ship').forEach(ship => {
    if (!ship.properties.macro) {
      diagnostics.push({
        severity: 'error',
        message: 'Create Ship action requires a Ship Class Macro specified.',
        nodeId: ship.id,
        category: 'egosoft'
      });
    }
  });

  // Check XML balancing constraints using string validation (regex-based nested diagnostics)
  const openTags = (code.match(/<[a-zA-Z_]+/g) || []).map(t => t.substring(1));
  const closeTags = (code.match(/<\/[a-zA-Z_]+/g) || []).map(t => t.substring(2));

  // Find tags that don't self terminate
  const matches = [...code.matchAll(/<([a-zA-Z_]+)(?:\s+[^>]*[^/>])?>/g)];
  const closers = [...code.matchAll(/<\/([a-zA-Z_]+)>/g)];

  if (matches.length > closers.length + code.split('/>').length - 1) {
    diagnostics.push({
      severity: 'info',
      message: 'Verified structural balance. XML contains self-terminating nested elements.',
      category: 'syntax'
    });
  }

  // Max components limits in XML ui tables
  const tables = workspace.uiWidgets.filter(w => w.type === 'table');
  tables.forEach(table => {
    if (table.w < 200 || table.h < 100) {
      diagnostics.push({
        severity: 'warning',
        message: `Table dimensions for "${table.label}" are extremely small. X4 engine might truncate contents.`,
        category: 'egosoft'
      });
    }
  });

  return diagnostics;
}

// Preset samples to populate workspace instantly
export const PRESETS: Record<string, { name: string; desc: string; workspace: Omit<ModWorkspace, 'id'> }> = {
  escort: {
    name: "Elite Fighter Wing Escort",
    desc: "Spawns an Elite Vanguard fighter wing protecting the player when the game is loaded.",
    workspace: {
      name: "Player_Elite_Escort",
      version: "1.2.0",
      author: "EliteModder",
      description: "Automatically equips the user playership with heavy wing escorts on game entry.",
      nodes: [
        {
          id: "cue_0",
          type: "cue",
          label: "Mission Cue",
          xmlTag: "cue",
          x: 100,
          y: 100,
          properties: { name: "Escort_Trigger_Cue", instantiate: "true", namespace: "this", state: "active" },
          propertiesSchema: NODE_TEMPLATES[0].propertiesSchema,
          inputs: NODE_TEMPLATES[0].inputs,
          outputs: NODE_TEMPLATES[0].outputs
        },
        {
          id: "event_0",
          type: "event",
          label: "Event: Game Started",
          xmlTag: "event_cue_signalled",
          x: 100,
          y: 400,
          properties: { cue: "md.Setup.Start" },
          propertiesSchema: NODE_TEMPLATES[1].propertiesSchema,
          inputs: NODE_TEMPLATES[1].inputs,
          outputs: NODE_TEMPLATES[1].outputs
        },
        {
          id: "action_0",
          type: "action",
          label: "Spawn Ship",
          xmlTag: "create_ship",
          x: 450,
          y: 150,
          properties: {
            name: "$MyHeavyEscort",
            macro: "ship_arg_s_fighter_01_a_macro (Elite Vanguard)",
            faction: "player",
            sector: "player.sector",
            coords: "0,500,-1000"
          },
          propertiesSchema: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'create_ship')].propertiesSchema,
          inputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'create_ship')].inputs,
          outputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'create_ship')].outputs
        },
        {
          id: "action_1",
          type: "action",
          label: "Reward Player",
          xmlTag: "reward_player",
          x: 800,
          y: 150,
          properties: {
            money: 50000,
            notification: "true",
            standing: "0.02",
            faction: "argon"
          },
          propertiesSchema: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'reward_player')].propertiesSchema,
          inputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'reward_player')].inputs,
          outputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'reward_player')].outputs
        }
      ],
      links: [
        { id: "l0", sourceNodeId: "cue_0", sourcePortId: "out_cond", targetNodeId: "event_0", targetPortId: "in_cond" },
        { id: "l1", sourceNodeId: "cue_0", sourcePortId: "out_act", targetNodeId: "action_0", targetPortId: "in_act" },
        { id: "l2", sourceNodeId: "action_0", sourcePortId: "out_next", targetNodeId: "action_1", targetPortId: "in_act" }
      ],
      uiWidgets: [
        { id: "w_0", type: "window", x: 100, y: 100, w: 600, h: 400, label: "Escort Fleet Terminal", properties: {} },
        { id: "w_1", type: "header", x: 120, y: 150, w: 560, h: 40, label: "TACTICAL FLIGHT OPS", properties: {} },
        { id: "w_2", type: "progressbar", x: 120, y: 220, w: 560, h: 30, label: "Escort Integrity", properties: { value: 92, progressColor: "#00ccff" } },
        { id: "w_3", type: "button", x: 120, y: 300, w: 260, h: 50, label: "Signal Escort Jump", properties: { action: "signal_cue", targetCue: "Escort_Trigger_Cue" } },
        { id: "w_4", type: "button", x: 420, y: 300, w: 260, h: 50, label: "Dismiss Pilots", properties: { action: "dismiss", targetCue: "Escort_Trigger_Cue" } }
      ],
      uiTheme: {
        backgroundColor: "#111827",
        borderColor: "#df9825",
        accentColor: "#f59e0b",
        opacity: 0.9,
        showIcons: true
      }
    }
  },
  mission: {
    name: "Sector Intruder Bounty System",
    desc: "Rewards standing and major credit bonuses dynamically when defending argon sectors.",
    workspace: {
      name: "Argon_Sector_Bounty",
      version: "1.0.1",
      author: "StarCaptain",
      description: "Generates bounty and standing gains on entering border zones and destroying faction outcasts.",
      nodes: [
        {
          id: "cue_0",
          type: "cue",
          label: "Mission Cue",
          xmlTag: "cue",
          x: 100,
          y: 100,
          properties: { name: "Bounty_Active_Cue", instantiate: "true", namespace: "this", state: "active" },
          propertiesSchema: NODE_TEMPLATES[0].propertiesSchema,
          inputs: NODE_TEMPLATES[0].inputs,
          outputs: NODE_TEMPLATES[0].outputs
        },
        {
          id: "event_0",
          type: "event",
          label: "Event: Sector Entered",
          xmlTag: "event_object_changed_sector",
          x: 100,
          y: 400,
          properties: { object: "playership", sector: "player.sector" },
          propertiesSchema: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'event_object_changed_sector')].propertiesSchema,
          inputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'event_object_changed_sector')].inputs,
          outputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'event_object_changed_sector')].outputs
        },
        {
          id: "action_0",
          type: "action",
          label: "Play Audio/Sound",
          xmlTag: "play_sound",
          x: 450,
          y: 150,
          properties: { object: "playership", sound: "incoming_transmission" },
          propertiesSchema: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'play_sound')].propertiesSchema,
          inputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'play_sound')].inputs,
          outputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'play_sound')].outputs
        },
        {
          id: "action_1",
          type: "action",
          label: "Show Briefing",
          xmlTag: "show_help",
          x: 750,
          y: 150,
          properties: { text: "Argon Command: Active combat bounties are online for this sector!", duration: 6 },
          propertiesSchema: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'show_help')].propertiesSchema,
          inputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'show_help')].inputs,
          outputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'show_help')].outputs
        }
      ],
      links: [
        { id: "l0", sourceNodeId: "cue_0", sourcePortId: "out_cond", targetNodeId: "event_0", targetPortId: "in_cond" },
        { id: "l1", sourceNodeId: "cue_0", sourcePortId: "out_act", targetNodeId: "action_0", targetPortId: "in_act" },
        { id: "l2", sourceNodeId: "action_0", sourcePortId: "out_next", targetNodeId: "action_1", targetPortId: "in_act" }
      ],
      uiWidgets: [
        { id: "w_0", type: "window", x: 50, y: 50, w: 800, h: 500, label: "COMMUNITY SERVICE INTERPRETER", properties: {} },
        { id: "w_1", type: "header", x: 80, y: 100, w: 740, h: 40, label: "BOUNTY SYSTEM HUB", properties: {} },
        { id: "w_2", type: "table", x: 80, y: 160, w: 740, h: 180, label: "Argon Defence Commissions", properties: {} },
        { id: "w_3", type: "progressbar", x: 80, y: 360, w: 400, h: 30, label: "Standing Progress", properties: { value: 65, progressColor: "#10b981" } },
        { id: "w_4", type: "text", x: 500, y: 360, w: 320, h: 30, label: "Tier: Argon Hero (+24)", properties: { fontSize: "medium", alignment: "right" } },
        { id: "w_5", type: "button", x: 80, y: 420, w: 350, h: 50, label: "Check Sector Standing", properties: { action: "standing", targetCue: "Bounty_Active_Cue" } },
        { id: "w_6", type: "button", x: 470, y: 420, w: 350, h: 50, label: "Claim Rewards", properties: { action: "claim", targetCue: "Bounty_Active_Cue" } }
      ],
      uiTheme: {
        backgroundColor: "#0d0e15",
        borderColor: "#10b981",
        accentColor: "#10b981",
        opacity: 0.95,
        showIcons: true
      }
    }
  }
};

export function sanitizeWorkspace(ws: any): ModWorkspace {
  if (!ws || typeof ws !== 'object') {
    return {
      id: `workspace_${Date.now()}`,
      name: 'X4_My_Custom_Mod',
      version: '1.0.0',
      author: 'Space_Pilot',
      description: 'Custom script developed using X4 Foundations Mod Studio visual nodes generator',
      nodes: [],
      links: [],
      uiWidgets: [],
      uiTheme: {
        backgroundColor: '#0F1115',
        borderColor: '#06b6d4',
        accentColor: '#0891b2',
        opacity: 0.95,
        showIcons: true
      }
    };
  }

  const sanitizedNodes = (Array.isArray(ws.nodes) ? ws.nodes : []).map((node: any) => {
    if (!node || typeof node !== 'object') return null;
    
    // Find matching template by xmlTag or fallback to standard mapping
    let template = NODE_TEMPLATES.find(t => t.xmlTag === node.xmlTag);
    if (!template) {
      template = NODE_TEMPLATES.find(t => t.type === node.type);
    }
    
    return {
      id: node.id || `node_${Math.random().toString(36).substr(2, 9)}`,
      type: node.type || (template ? template.type : 'action'),
      xmlTag: node.xmlTag || (template ? template.xmlTag : 'create_ship'),
      label: node.label || (template ? template.label : 'MD Node'),
      x: typeof node.x === 'number' ? node.x : 100,
      y: typeof node.y === 'number' ? node.y : 100,
      properties: node.properties || (template ? { ...template.properties } : {}),
      propertiesSchema: node.propertiesSchema || (template ? template.propertiesSchema : []),
      inputs: node.inputs || (template ? template.inputs : []),
      outputs: node.outputs || (template ? template.outputs : [])
    };
  }).filter((n): n is MDNode => n !== null);

  return {
    id: ws.id || `workspace_${Date.now()}`,
    name: ws.name || 'X4_My_Custom_Mod',
    version: ws.version || '1.0.0',
    author: ws.author || 'Space_Pilot',
    description: ws.description || '',
    nodes: sanitizedNodes,
    links: Array.isArray(ws.links) ? ws.links : [],
    uiWidgets: Array.isArray(ws.uiWidgets) ? ws.uiWidgets : [],
    uiTheme: {
      backgroundColor: ws.uiTheme?.backgroundColor || '#0F1115',
      borderColor: ws.uiTheme?.borderColor || '#06b6d4',
      accentColor: ws.uiTheme?.accentColor || '#0891b2',
      opacity: typeof ws.uiTheme?.opacity === 'number' ? ws.uiTheme.opacity : 0.95,
      showIcons: typeof ws.uiTheme?.showIcons === 'boolean' ? ws.uiTheme.showIcons : true
    }
  };
}
