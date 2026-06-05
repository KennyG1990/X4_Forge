/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

// Import types & helpers from the frontend shared file
import {
  generateMDXML,
  generateUIXML,
  validateModWorkspace,
  X4_FACTIONS,
  X4_SHIP_MACROS,
  X4_STATION_MACROS,
  X4_SOUND_EFFECTS,
  NODE_TEMPLATES,
  PRESETS,
  ModWorkspace
} from "./src/types";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "5mb" }));

// Enable CORS for external AI Agent integrations
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-ai-provider, x-custom-api-key");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Server-persisted active workspace (in-memory, preloaded with the Escort project)
const DEFAULT_WORKSPACE: ModWorkspace = {
  id: "workspace_default",
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
    }
  ],
  links: [
    { id: "l0", sourceNodeId: "cue_0", sourcePortId: "out_cond", targetNodeId: "event_0", targetPortId: "in_cond" },
    { id: "l1", sourceNodeId: "cue_0", sourcePortId: "out_act", targetNodeId: "action_0", targetPortId: "in_act" }
  ],
  uiWidgets: [
    { id: "w_0", type: "window", x: 100, y: 100, w: 420, h: 300, label: "Escort Fleet Terminal", properties: {} },
    { id: "w_1", type: "header", x: 120, y: 140, w: 380, h: 40, label: "TACTICAL FLIGHT OPS", properties: {} },
    { id: "w_2", type: "progressbar", x: 120, y: 200, w: 380, h: 30, label: "Escort Integrity", properties: { value: 92, progressColor: "#00ccff" } }
  ],
  uiTheme: {
    backgroundColor: "#111827",
    borderColor: "#06b6d4",
    accentColor: "#0891b2",
    opacity: 0.9,
    showIcons: true
  }
};

let activeWorkspace: ModWorkspace = JSON.parse(JSON.stringify(DEFAULT_WORKSPACE));
// Track version counter to help with client-side merge prompts
let workspaceVersion = 1;

// -----------------------------------------------------
// Helper to call generateContent with retry and fallback model capability
// to handle temporary 503 Spikes in Demand / UNAVAILABLE errors.
// -----------------------------------------------------
async function generateContentWithRetry(ai: any, params: any, maxRetries = 2) {
  const modelsToTry = [params.model, "gemini-3.1-flash-lite", "gemini-flash-latest"];
  const modelsList = Array.from(new Set(modelsToTry.filter(Boolean)));
  
  let lastError: any = null;
  
  for (const modelName of modelsList) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[AI-STUDIO] Trying generation on model: ${modelName} (attempt ${attempt}/${maxRetries})`);
        const response = await ai.models.generateContent({
          ...params,
          model: modelName,
        });
        return response;
      } catch (error: any) {
        lastError = error;
        const errMessage = error.message || "";
        const errString = JSON.stringify(error) || "";
        const is503 = errMessage.includes("503") || 
                      errMessage.toLowerCase().includes("unavailable") || 
                      errMessage.toLowerCase().includes("high demand") || 
                      errString.includes("503") || 
                      errString.toLowerCase().includes("unavailable") ||
                      errString.toLowerCase().includes("high demand");
                      
        console.error(`[AI-STUDIO] Error with model ${modelName} on attempt ${attempt}:`, error);
        
        if (is503) {
          if (attempt < maxRetries) {
            const delay = attempt * 1200;
            console.log(`[AI-STUDIO] Retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          } else {
            console.warn(`[AI-STUDIO] Model ${modelName} failed after max retries.`);
          }
        } else {
          // If we encounter a critical non-503 failure (e.g. incorrect parameter or permissions),
          // skip to trying the fallback model immediately.
          break;
        }
      }
    }
  }
  
  throw lastError || new Error("All model options and retries failed.");
}

// -----------------------------------------------------
// Unified Multi-Provider AI Endpoint Controller (Gemini, Claude, OpenAI)
// Plays direct native fetch proxy requests to protect backend secrets.
// -----------------------------------------------------
async function callMultiProviderAI(
  req: express.Request,
  systemInstruction: string,
  prompt: string,
  responseFormat: "json" | "text" = "text",
  jsonSchema?: any
): Promise<string> {
  const provider = (req.headers["x-ai-provider"] as string) || "gemini";
  const customKey = (req.headers["x-custom-api-key"] as string) || "";
  const model = (req.headers["x-ai-model"] as string) || "";
  const reasoning = (req.headers["x-ai-reasoning"] as string) || "none";

  if (provider === "claude") {
    const claudeKey = customKey || process.env.ANTHROPIC_API_KEY;
    if (!claudeKey) {
      throw new Error("Anthropic API key is not configured. Please supply your API Key in the AI Providers settings modal.");
    }

    const finalModel = model || "claude-3-5-sonnet-latest";
    let finalPrompt = prompt;
    if (responseFormat === "json") {
      finalPrompt = `${prompt}\n\nCRITICAL: Return ONLY a raw, fully valid JSON object fitting this schema specifications: ${JSON.stringify(jsonSchema || {})}. Do NOT wrap the JSON inside markdown blocks or include any extra conversational text! Only output valid JSON!`;
    }

    const bodyPayload: any = {
      model: finalModel,
      system: systemInstruction,
      messages: [
        { role: "user", content: finalPrompt }
      ]
    };

    // If user requested active thinking level, configure budget_tokens
    if (reasoning !== "none" && (finalModel.includes("3-7") || finalModel.includes("4-") || finalModel.includes("thinking") || reasoning === "extra_high" || reasoning === "high")) {
      let budget = 2048;
      if (reasoning === "low") budget = 1024;
      else if (reasoning === "medium") budget = 2048;
      else if (reasoning === "high") budget = 4096;
      else if (reasoning === "extra_high") budget = 8192;

      bodyPayload.thinking = {
        type: "enabled",
        budget_tokens: budget
      };
      bodyPayload.max_tokens = budget + 4000;
    } else {
      bodyPayload.max_tokens = 4000;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": claudeKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify(bodyPayload)
    });

    const data: any = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `Anthropic Claude API returned error code ${response.status}`);
    }

    let textOut = data?.content?.[0]?.text || "";
    // Clean codeblock wraps if returned
    if (textOut.trim().startsWith("```")) {
      textOut = textOut.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
    }
    return textOut.trim();

  } else if (provider === "openai") {
    const openaiKey = customKey || process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error("OpenAI API key is not configured. Please supply your API Key in the AI Providers settings modal.");
    }

    const finalModel = model || "gpt-4o";
    let finalPrompt = prompt;
    if (responseFormat === "json") {
      finalPrompt = `${prompt}\n\nCRITICAL: Return ONLY a raw, fully valid JSON object fitting this schema specifications: ${JSON.stringify(jsonSchema || {})}. Do NOT wrap the JSON inside markdown blocks or include any extra conversational text! Only output valid JSON!`;
    }

    const bodyPayload: any = {
      model: finalModel,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: finalPrompt }
      ],
      response_format: responseFormat === "json" ? { type: "json_object" } : undefined
    };

    // Custom reasoning levels for o-models / reasoning
    if (reasoning !== "none" && (finalModel.startsWith("o") || finalModel.includes("reasoning"))) {
      let effort: "low" | "medium" | "high" = "medium";
      if (reasoning === "low") effort = "low";
      else if (reasoning === "medium") effort = "medium";
      else if (reasoning === "high" || reasoning === "extra_high") effort = "high";

      bodyPayload.reasoning_effort = effort;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(bodyPayload)
    });

    const data: any = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `OpenAI API returned error code ${response.status}`);
    }

    let textOut = data?.choices?.[0]?.message?.content || "";
    // Clean codeblock wraps if returned
    if (textOut.trim().startsWith("```")) {
      textOut = textOut.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
    }
    return textOut.trim();

  } else if (provider === "openrouter") {
    const openrouterKey = customKey || process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY;
    if (!openrouterKey) {
      throw new Error("OpenRouter API key is not configured. Please supply your API Key in the AI Providers settings modal.");
    }

    const finalModel = model || "google/gemini-2.1-flash";
    let finalPrompt = prompt;
    if (responseFormat === "json") {
      finalPrompt = `${prompt}\n\nCRITICAL: Return ONLY a raw, fully valid JSON object fitting this schema specifications: ${JSON.stringify(jsonSchema || {})}. Do NOT wrap the JSON inside markdown blocks or include any extra conversational text! Only output valid JSON!`;
    }

    const bodyPayload: any = {
      model: finalModel,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: finalPrompt }
      ],
      response_format: responseFormat === "json" ? { type: "json_object" } : undefined
    };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai.studio/build",
        "X-Title": "AI Studio Build"
      },
      body: JSON.stringify(bodyPayload)
    });

    const data: any = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || `OpenRouter API returned error code ${response.status}`);
    }

    let textOut = data?.choices?.[0]?.message?.content || "";
    if (textOut.trim().startsWith("```")) {
      textOut = textOut.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
    }
    return textOut.trim();

  } else {
    // Default to Google Gemini API (standard model schema)
    const geminiKey = customKey || process.env.GEMINI_API_KEY;
    if (!geminiKey || geminiKey === "MY_GEMINI_API_KEY") {
      throw new Error("Gemini API key is not configured. Please supply your API Key in the AI Providers settings modal to enable cognitive assistance.");
    }

    const finalModel = model || "gemini-3.5-flash";

    const ai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const config: any = {
      systemInstruction,
      temperature: responseFormat === "json" ? 0.3 : 0.7,
    };

    if (reasoning !== "none") {
      // Set thinking budget or custom instructions
      let extraInstructions = "";
      if (reasoning === "low") extraInstructions = "\n(Optimize for brief, straightforward, direct responses with light analysis)";
      else if (reasoning === "medium") extraInstructions = "\n(Employ steady logical step-by-step thinking processes for accuracy)";
      else if (reasoning === "high") extraInstructions = "\n(Utilize deep internal multi-step reasoning before outputting details)";
      else if (reasoning === "extra_high") extraInstructions = "\n(Maximize comprehensive logical thinking effort and address all latent edge cases)";
      
      config.systemInstruction = `${systemInstruction}${extraInstructions}`;
    }

    if (responseFormat === "json") {
      config.responseMimeType = "application/json";
      config.responseSchema = jsonSchema;
    }

    const response = await generateContentWithRetry(ai, {
      model: finalModel,
      contents: prompt,
      config
    });

    return response.text || "";
  }
}

// -----------------------------------------------------
// 1. ORIGINAL GEMINI CHAT CHOTBOT API
// -----------------------------------------------------
app.post("/api/gemini", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt parameter." });
  }

  try {
    const systemInstruction = "You are an elite X4: Foundations XML & Mission Director MD scripting expert. Help the player write clean, functional scripts. Maximize brief and scan-friendly code blocks using markdown formatting. Avoid lengthy definitions, get straight to functional XML examples and tips.";
    const responseText = await callMultiProviderAI(req, systemInstruction, prompt, "text");
    return res.json({ text: responseText });
  } catch (error: any) {
    console.error("Multi-Provider chat routing error: ", error);
    return res.status(500).json({ error: error.message || "Failed to trigger AI compilation." });
  }
});

/**
 * POST /api/gemini/analyze
 * Analyzes the visual graph workspace and returns a structured, plain-English summary breakdown.
 */
app.post("/api/gemini/analyze", async (req, res) => {
  const { workspace } = req.body;
  if (!workspace) {
    return res.status(400).json({ error: "Missing workspace in request body." });
  }

  try {
    const systemInstruction = `You are a cognitive script compiler and narrative designer for X4: Foundations' Egosoft Mission Director (MD) codebase.
Your task is to analyze the provided visual graph workspace representing an X4 mod. Explain in plain English how the logic flows, what events are triggered, what actions are taken, and registry of any entities created (ships, stations, sounds, UI widgets, etc.).
Be highly precise and translate technical terms to clear logical human outcomes. Avoid overly technical jargon, make it friendly, descriptive, and clean. Ensure to outline safety warnings if any logical flaws exist (like disconnected nodes or triggers with no actions).`;

    const prompt = `Analyze this X4 Foundations ModWorkspace: ${JSON.stringify(workspace)}`;
    const schema = {
      type: Type.OBJECT,
      required: ["summary", "triggerCondition", "flowSteps", "entityRegistry", "tacticalInsights"],
      properties: {
        summary: {
          type: Type.STRING,
          description: "A high-level 1-2 sentence overview of what this script actually accomplishes in plain English."
        },
        triggerCondition: {
          type: Type.STRING,
          description: "Clear explanation of how the script triggers in the game (e.g. game start, entering slot, sector change, etc.)."
        },
        flowSteps: {
          type: Type.ARRAY,
          description: "Step-by-step logical progression of the cues and links in the node network. Detail the links / connections between nodes in clear sequential order.",
          items: {
            type: Type.OBJECT,
            required: ["nodeId", "nodeLabel", "xmlTag", "plainEnglishAction", "sequenceOrder"],
            properties: {
              nodeId: { type: Type.STRING },
              nodeLabel: { type: Type.STRING },
              xmlTag: { type: Type.STRING },
              plainEnglishAction: { type: Type.STRING, description: "A highly descriptive sentence explaining what this specific node does and what settings it uses." },
              sequenceOrder: { type: Type.INTEGER, description: "Sequential order of execution start from 1" }
            }
          }
        },
        entityRegistry: {
          type: Type.ARRAY,
          description: "List of all physical or auditory assets created/spawned or customized by this script, including HUD UI widgets designed.",
          items: {
            type: Type.OBJECT,
            required: ["name", "type", "detail"],
            properties: {
              name: { type: Type.STRING, description: "Variables name or reference, e.g. $MyHeavyEscort, UI Frame 1, Sound: alarm_red" },
              type: { type: Type.STRING, description: "e.g., Ship, Station, UI Widget, Sound, State" },
              detail: { type: Type.STRING, description: "Specification details, like macros, faction settings, dimensions, colors, or values." }
            }
          }
        },
        tacticalInsights: {
          type: Type.ARRAY,
          description: "3 highly valuable recommendations, tips, or potential logic safety bugs about this visual script layout.",
          items: {
            type: Type.STRING
          }
        }
      }
    };

    const textOutput = await callMultiProviderAI(req, systemInstruction, prompt, "json", schema);
    const analysisResult = JSON.parse(textOutput.trim());
    return res.json({ analysis: analysisResult });

  } catch (error: any) {
    console.error("AI script analysis request error: ", error);
    return res.status(500).json({ error: error.message || "Failed to analyze mod script using AI." });
  }
});

/**
 * POST /api/gemini/analyze-log
 * Analyzes copy-pasted or uploaded debug.log contents, matches errors, logs, or cue warnings
 * with the visual script workspace, and generates direct 1-click playtest auto-fixes.
 */
app.post("/api/gemini/analyze-log", async (req, res) => {
  const { workspace, logs } = req.body;
  if (!workspace || !logs) {
    return res.status(400).json({ error: "Missing workspace or logs in request body." });
  }

  try {
    const systemInstruction = `You are a legendary senior game engine compiler and Mission Director (MD) debugger for X4: Foundations (Egosoft).
Your job is to analyze the user's modding game logs (such as debug.log or custom terminal traces) in context with their visual node workspace.
You must find and correlate issues mentioned in the logs to the specific nodes in the workspace.
For each correlated issue, explain the cause in clear plain English, cite the effect on the game, recommend a detailed playbook action, and provide a 1-click JSON "autoFix" structure to update a node property in the editor when applicable.

Validation / Correlation Rules:
- Under 'affectedNodeId', specify the ID of the node that caused or is corresponding to the error (e.g., matching a cue name to the node's 'name' property, or a sound/ship action).
- If 'autoFix' is generated, set type: 'update_node_property', nodeId to the ID of that node, propertyKey to the property key (like 'instantiate', 'faction', 'macro', etc.), and propertyValue to the corrected value.
- If no node perfectly matches, or it's a general game load log, leave affectedNodeId empty and omit the autoFix field.
- Be supportive, knowledgeable, and provide awesome expert playtester tips.`;

    const prompt = `Here is the current visual workspace:
${JSON.stringify({
  name: workspace.name,
  description: workspace.description,
  nodes: workspace.nodes.map((n: any) => ({ id: n.id, type: n.type, label: n.label, properties: n.properties, xmlTag: n.xmlTag })),
  links: workspace.links
})}

Here is the log segment uploaded by the user / playtester:
-----
${logs}
-----

Analyze this trace and return the structured issues diagnostics and suggestions.`;

    const schema = {
      type: Type.OBJECT,
      required: ["parsedLogsCount", "issues", "summaryOfGameMDReload"],
      properties: {
        parsedLogsCount: {
          type: Type.INTEGER,
          description: "Estimated number of distinct MD script errors/warnings parsed from logs"
        },
        summaryOfGameMDReload: {
          type: Type.STRING,
          description: "Brief human diagnosis summarizing the current playtest session reload state in X4."
        },
        issues: {
          type: Type.ARRAY,
          description: "Array of distinct warning/error issues found with actionable solutions.",
          items: {
            type: Type.OBJECT,
            required: ["id", "severity", "title", "errorLogSnippet", "explanation", "impact", "suggestedAction"],
            properties: {
              id: { type: Type.STRING, description: "Unique ID for identifying issue e.g. err_1" },
              severity: { type: Type.STRING, description: "Must be 'error' or 'warning'" },
              title: { type: Type.STRING, description: "Short descriptive title of the issue" },
              errorLogSnippet: { type: Type.STRING, description: "The exact line or relevant segment from user's logs" },
              explanation: { type: Type.STRING, description: "Why the Egosoft engine threw this warning/error" },
              impact: { type: Type.STRING, description: "How this impacts the gameplay experience or script execution" },
              suggestedAction: { type: Type.STRING, description: "Clear instructions of how the player should fix this manually inside or outside" },
              affectedNodeId: { type: Type.STRING, description: "Optional. The exact node ID from the workspace suffering from this issue." },
              autoFix: {
                type: Type.OBJECT,
                description: "Optional. Provide a 1-click auto-repair payload for the editor if applicable.",
                properties: {
                  type: { type: Type.STRING, description: "Must be 'update_node_property'" },
                  nodeId: { type: Type.STRING },
                  propertyKey: { type: Type.STRING, description: "Name of property to change on node" },
                  propertyValue: { type: Type.STRING, description: "The new corrected value for property" }
                }
              }
            }
          }
        }
      }
    };

    const textOutput = await callMultiProviderAI(req, systemInstruction, prompt, "json", schema);
    const parsedOutput = JSON.parse(textOutput.trim());
    return res.json({ analysis: parsedOutput });

  } catch (error: any) {
    console.error("AI log analysis error: ", error);
    return res.status(500).json({ error: error.message || "Failed to analyze X4 reload logs via AI compiler." });
  }
});


// -----------------------------------------------------
// 2. EXTERNAL AI AGENT DEVELOPMENT API ENDPOINTS
// -----------------------------------------------------

/**
 * GET /api/agent/schema
 * Exposes core constants, valid selection macro values, structural boundaries, and base templates.
 * Extremely helpful for AI agents to understand exactly what values are valid before making updates.
 */
app.get("/api/agent/schema", (req, res) => {
  return res.json({
    description: "X4 Foundations Mod Studio schema rules dictionary to instruct AI clients.",
    constants: {
      factions: X4_FACTIONS,
      ship_macros: X4_SHIP_MACROS,
      station_macros: X4_STATION_MACROS,
      sound_effects: X4_SOUND_EFFECTS,
    },
    node_templates: NODE_TEMPLATES,
    presets_list: Object.keys(PRESETS).map(key => ({
      id: key,
      name: PRESETS[key].name,
      desc: PRESETS[key].desc
    }))
  });
});

/**
 * GET /api/agent/workspace
 * Retrieves the currently active, synchronized workspace state.
 */
app.get("/api/agent/workspace", (req, res) => {
  return res.json({
    workspace: activeWorkspace,
    version: workspaceVersion,
    lastUpdated: new Date().toISOString()
  });
});

/**
 * POST /api/agent/workspace
 * Updates the currently active workspace state and bumps the revision version.
 */
app.post("/api/agent/workspace", (req, res) => {
  const { workspace } = req.body;
  if (!workspace) {
    return res.status(400).json({ error: "Missing required 'workspace' body parameter." });
  }

  // Set the workspace
  activeWorkspace = workspace;
  workspaceVersion++;

  return res.json({
    success: true,
    message: "Workspace successfully updated on the studio, bumping version.",
    version: workspaceVersion,
    workspace: activeWorkspace
  });
});

/**
 * POST /api/agent/compile
 * Compiles a submitted workspace JSON body on-the-fly and runs the Mod Studio XML validator check.
 */
app.post("/api/agent/compile", (req, res) => {
  const ws = req.body.workspace || activeWorkspace;
  try {
    const mdxml = generateMDXML(ws);
    const uixml = generateUIXML(ws);
    const diagnostics = validateModWorkspace(ws, mdxml);

    return res.json({
      success: true,
      files: {
        mission_director_xml: mdxml,
        ui_layout_xml: uixml
      },
      diagnostics
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to compile workspace schema to XML."
    });
  }
});

/**
 * POST /api/agent/generate
 * Prompts the built-in Gemini language model to map a natural language instruction directly
 * into a highly complex, logical ModWorkspace structured JSON value.
 */
app.post("/api/agent/generate", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Missing 'prompt' body parameter." });
  }

  try {
    const systemInstruction = `You are a high-fidelity visual translator agent for the "X4 Foundations Mod Studio".
Your task is to take a natural language command and design a fully connected, functional "ModWorkspace" JSON schema.
Connect the node inputs and outputs visually and logically. Put the coordinates (x, y) at a clean visual distance (like 300px increments) to display beautifully in a bento layout node network.

CRITICAL RULES:
1. ONLY return a raw JSON string matching the specified workspace schema.
2. NEVER wrap your output in markdown \`\`\`json ... \`\`\` blocks! Return ONLY raw, pure parsable JSON.
3. Every node MUST have valid connections listed in the "links" array.
4. If they ask to spawn a ship or station, make sure to use exact valid macros (e.g. ship macros like 'ship_arg_l_destroyer_01_a_macro (Behemoth Van.)' and stations like 'station_arg_defense_01_macro (Defence Station)').

Valid Factions: 'player', 'argon', 'xenon', 'khaak', 'split', 'paranid', 'teladi', 'terran' etc.
Valid Audio Sounds: 'notification_generic', 'mission_accomplished', 'mission_failed', 'incoming_transmission', 'alarm_red'.`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "Alphanumeric mod name with underscores, e.g. Bounty_Killer_Mod" },
        version: { type: Type.STRING },
        author: { type: Type.STRING },
        description: { type: Type.STRING },
        nodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ["id", "type", "label", "xmlTag", "x", "y", "properties", "inputs", "outputs"],
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, description: "Must be custom type matching: cue, event, condition, action, variable" },
              label: { type: Type.STRING },
              xmlTag: { type: Type.STRING },
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              properties: { type: Type.OBJECT, description: "Key-value of settings based on node xmlTag definition" },
              inputs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  required: ["id", "name", "type"],
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    type: { type: Type.STRING }
                  }
                }
              },
              outputs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  required: ["id", "name", "type"],
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    type: { type: Type.STRING }
                  }
                }
              }
            }
          }
        },
        links: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ["id", "sourceNodeId", "sourcePortId", "targetNodeId", "targetPortId"],
            properties: {
              id: { type: Type.STRING },
              sourceNodeId: { type: Type.STRING },
              sourcePortId: { type: Type.STRING },
              targetNodeId: { type: Type.STRING },
              targetPortId: { type: Type.STRING }
            }
          }
        },
        uiWidgets: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ["id", "type", "x", "y", "w", "h", "label", "properties"],
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, description: "window, table, button, progressbar, check, text, dropdown, header" },
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              w: { type: Type.NUMBER },
              h: { type: Type.NUMBER },
              label: { type: Type.STRING },
              properties: { type: Type.OBJECT }
            }
          }
        },
        uiTheme: {
          type: Type.OBJECT,
          required: ["backgroundColor", "borderColor", "accentColor", "opacity", "showIcons"],
          properties: {
            backgroundColor: { type: Type.STRING },
            borderColor: { type: Type.STRING },
            accentColor: { type: Type.STRING },
            opacity: { type: Type.NUMBER },
            showIcons: { type: Type.BOOLEAN }
          }
        }
      }
    };

    const textOutput = await callMultiProviderAI(req, systemInstruction, prompt, "json", schema);
    const generatedWorkspace = JSON.parse(textOutput.trim());

    // Generate automatic unique ids for items if missing
    generatedWorkspace.id = `workspace_${Date.now()}`;

    // Apply globally to the shared space
    activeWorkspace = generatedWorkspace;
    workspaceVersion++;

    return res.json({
      success: true,
      message: "AI Agent successfully designed and applied a new mod schema to the workspace!",
      version: workspaceVersion,
      workspace: generatedWorkspace
    });

  } catch (error: any) {
    console.error("AI Agent layout generation error: ", error);
    return res.status(500).json({
      error: error.message || "Failed to trigger automated workspace planner."
    });
  }
});


// -----------------------------------------------------
// 3. SECURE GITHUB API SYSTEM PROXY
// -----------------------------------------------------

app.post("/api/github/load", async (req, res) => {
  const { pat, owner, repo, path: filePath, branch } = req.body;
  
  if (!owner || !repo || !filePath) {
    return res.status(400).json({ error: "Missing repo parameters (owner, repo, or path)." });
  }

  // Token is optional if repo is public, but helpful to configure
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "x4-md-studio-proxy"
  };

  if (pat) {
    headers["Authorization"] = `token ${pat}`;
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch || "main"}`;
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: `GitHub returned error: ${response.statusText}`,
        details: errorText
      });
    }
    
    const data: any = await response.json();
    if (data.type !== "file") {
      return res.status(400).json({ error: "Selected path is not a single file." });
    }

    const decoded = Buffer.from(data.content, "base64").toString("utf-8");
    return res.json({
      success: true,
      sha: data.sha,
      content: decoded,
      fileName: data.name
    });
  } catch (error: any) {
    console.error("GitHub file load error: ", error);
    return res.status(500).json({ error: error.message || "Failed to load file from GitHub." });
  }
});

app.post("/api/github/push", async (req, res) => {
  const { pat, owner, repo, branch, commitMessage, files } = req.body;

  if (!pat) {
    return res.status(400).json({ error: "GitHub Personal Access Token (PAT) is required." });
  }
  if (!owner || !repo) {
    return res.status(400).json({ error: "Owner and repository name are required." });
  }
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: "No files provided to push." });
  }

  const selectedBranch = branch || "main";
  const msg = commitMessage || "Update mod files from X4:MD Studio";
  const results: any[] = [];

  try {
    // For each file, we'll sequentially commit it
    for (const file of files) {
      const { path: filePath, content } = file;
      if (!filePath || content === undefined) continue;

      const headers: Record<string, string> = {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": `token ${pat}`,
        "User-Agent": "x4-md-studio-proxy"
      };

      // 1. Get the pre-existing SHA if it exists
      let currentSha: string | undefined;
      const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${selectedBranch}`;
      
      try {
        const getRes = await fetch(getUrl, { headers });
        if (getRes.status === 200) {
          const getData: any = await getRes.json();
          currentSha = getData.sha;
        }
      } catch (getErr) {
        // Log error but ignore (might be new file)
        console.log(`Pre-fetch SHA failed for ${filePath}, assuming new file.`);
      }

      // 2. Put file contents back
      const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
      const base64Content = Buffer.from(content).toString("base64");
      
      const bodyPayload: any = {
        message: msg,
        content: base64Content,
        branch: selectedBranch
      };
      
      if (currentSha) {
        bodyPayload.sha = currentSha;
      }

      const putRes = await fetch(putUrl, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(bodyPayload)
      });

      if (!putRes.ok) {
        const errDetails = await putRes.text();
        throw new Error(`Failed to push file: ${filePath}. Status: ${putRes.status}, Response: ${errDetails}`);
      }

      const putData: any = await putRes.json();
      results.push({
        path: filePath,
        sha: putData.content.sha,
        success: true
      });
    }

    return res.json({
      success: true,
      message: `Successfully pushed ${results.length} files to ${owner}/${repo} on branch ${selectedBranch}.`,
      results
    });

  } catch (error: any) {
    console.error("GitHub push error: ", error);
    return res.status(500).json({ error: error.message || "Failed to commit files to GitHub." });
  }
});


// Configure Vite middleware or static serving
async function setupDevOrProd() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

setupDevOrProd().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`X4 Mod Studio Dev Server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error("Server failure: ", err);
});
