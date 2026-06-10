/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { createEmptySchemaLibrary, loadSchemaLibrary, readXsdConfig, resolveXsdConfig, writeXsdConfig } from "./src/lib/xsdParser";

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
import {
  toSafeModId,
  generateContentXML,
  compileScriptToXML,
  compileWaresXML,
  compileJobsXML,
  compileTFileXML,
  compileDiffDocument
} from "./src/lib/modCompiler";
import type { SchemaLibrary } from "./src/lib/schemaTypes";

dotenv.config();

const STUDIO_API_TOKEN = crypto.randomBytes(32).toString("hex");

const app = express();
const PORT = Number(process.env.PORT || 3000);

function loadCurrentSchemaLibrary(): SchemaLibrary {
  try {
    const resolved = resolveXsdConfig();
    const library = loadSchemaLibrary(resolved.schemaDir, resolved.schemaFiles || ['md.xsd', 'common.xsd']);
    console.log(`[AI-STUDIO] Loaded XSD schema library: ${library.events.length} events, ${library.conditions.length} conditions, ${library.actions.length} actions.`);
    return library;
  } catch (error: any) {
    console.warn(`[AI-STUDIO] XSD schema library unavailable: ${error.message || error}`);
    return createEmptySchemaLibrary(error.message || String(error));
  }
}

let schemaLibrary: SchemaLibrary = loadCurrentSchemaLibrary();
let schemaTemplatesByTag = new Map(schemaLibrary.templates.map(template => [template.xmlTag, template]));

function reloadSchemaLibrary(): SchemaLibrary {
  schemaLibrary = loadCurrentSchemaLibrary();
  schemaTemplatesByTag = new Map(schemaLibrary.templates.map(template => [template.xmlTag, template]));
  return schemaLibrary;
}

app.use(express.json({ limit: "5mb" }));

// Enable CORS for localhost / 127.0.0.1 integrations only
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:") || origin === "http://localhost" || origin === "http://127.0.0.1")) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-ai-provider, x-custom-api-key");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Auth token endpoint (returns the per-session token)
app.get("/api/auth/token", (req, res) => {
  return res.json({ token: STUDIO_API_TOKEN });
});

// Middleware to verify session token for all /api/* routes except the handshake
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.path === "/auth/token") {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing token." });
  }
  
  const token = authHeader.substring(7);
  if (token !== STUDIO_API_TOKEN) {
    return res.status(401).json({ error: "Unauthorized: Invalid token." });
  }
  
  next();
}

app.use("/api", authMiddleware);

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
      properties: {
        name: "Escort_Trigger_Cue",
        instantiate: "true",
        namespace: "this",
        state: "active"
      },
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
      propertiesSchema: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'event_cue_signalled')].propertiesSchema,
      inputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'event_cue_signalled')].inputs,
      outputs: NODE_TEMPLATES[NODE_TEMPLATES.findIndex(t => t.xmlTag === 'event_cue_signalled')].outputs
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
  const { prompt, currentWorkspace, diagnostics } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt parameter." });
  }

  try {
    const systemInstruction = "You are an elite X4: Foundations XML & Mission Director MD scripting expert. Help the player write clean, functional scripts. Maximize brief and scan-friendly code blocks using markdown formatting. Avoid lengthy definitions, get straight to functional XML examples and tips.";
    
    let finalPrompt = prompt;
    if (currentWorkspace) {
      finalPrompt = `You are helping the player analyze, fix, or write script code within the context of their active visual node-graph workspace and list of active XML schema diagnostics.

[Active Workspace Context]:
- Name: "${currentWorkspace.name}"
- Description: "${currentWorkspace.description || "No description provided."}"
- Nodes: ${JSON.stringify(currentWorkspace.nodes?.map((n: any) => ({ id: n.id, label: n.label, type: n.type, xmlTag: n.xmlTag, properties: n.properties })) || [])}
- Links/Connections: ${JSON.stringify(currentWorkspace.links || [])}
- UI Widgets: ${JSON.stringify(currentWorkspace.uiWidgets || [])}

[Live XML Schema Diagnostics (Errors / Warnings)]:
${diagnostics && diagnostics.length > 0 ? JSON.stringify(diagnostics, null, 2) : "0 Errors, 0 Warnings. Everything currently compiles and validates successfully!"}

[User Query / Direct Instructions]:
"${prompt}"

Please respond accurately to the user query using the above active workspace state and diagnostics as key context. If they are asking you to fix a warning or error, analyze which node or property is violating rules and tell them exactly how they can adjust those parameters!`;
    }

    const responseText = await callMultiProviderAI(req, systemInstruction, finalPrompt, "text");
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
    schema_library_loaded: schemaLibrary.loaded,
    schema_counts: {
      events: schemaLibrary.events.length,
      conditions: schemaLibrary.conditions.length,
      actions: schemaLibrary.actions.length,
      control_flow: schemaLibrary.controlFlow.length,
    },
    schema_node_templates: schemaLibrary.templates,
    presets_list: Object.keys(PRESETS).map(key => ({
      id: key,
      name: PRESETS[key].name,
      desc: PRESETS[key].desc
    }))
  });
});

app.get("/api/schema/library", (req, res) => {
  return res.json(schemaLibrary);
});

app.get("/api/schema/config", (req, res) => {
  try {
    return res.json({
      config: readXsdConfig(),
      resolved: resolveXsdConfig(),
      schema_counts: {
        events: schemaLibrary.events.length,
        conditions: schemaLibrary.conditions.length,
        actions: schemaLibrary.actions.length,
        control_flow: schemaLibrary.controlFlow.length,
      },
      loaded: schemaLibrary.loaded,
      error: schemaLibrary.error
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to read schema config." });
  }
});

app.post("/api/schema/config", (req, res) => {
  try {
    const schemaDir = String(req.body?.schemaDir || '').trim();
    const gamePath = String(req.body?.x4GamePath || '').trim();
    if (!schemaDir) {
      return res.status(400).json({ error: "Missing required schemaDir." });
    }

    const nextConfig = {
      ...readXsdConfig(),
      ...(gamePath ? { x4GamePath: gamePath } : {}),
      xsdSchemaPath: schemaDir,
      schemaFiles: ['md.xsd', 'common.xsd']
    };
    const resolved = resolveXsdConfig(nextConfig);
    if (!resolved.mdExists || !resolved.commonExists) {
      return res.status(400).json({
        error: "Schema directory must contain both md.xsd and common.xsd.",
        resolved
      });
    }

    writeXsdConfig(nextConfig);
    const library = reloadSchemaLibrary();
    return res.json({
      success: library.loaded,
      config: nextConfig,
      resolved: resolveXsdConfig(nextConfig),
      schema_counts: {
        events: library.events.length,
        conditions: library.conditions.length,
        actions: library.actions.length,
        control_flow: library.controlFlow.length,
      },
      loaded: library.loaded,
      error: library.error
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to update schema config." });
  }
});

app.get("/api/schema/element/:tag", (req, res) => {
  const tag = req.params.tag;
  const element = [
    ...schemaLibrary.events,
    ...schemaLibrary.conditions,
    ...schemaLibrary.actions,
    ...schemaLibrary.controlFlow
  ].find(item => item.tag === tag);

  if (!element) {
    return res.status(404).json({ error: `Schema element not found: ${tag}` });
  }
  return res.json(element);
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

  // Set the workspace and bump version only if it changed
  const isDifferent = JSON.stringify(workspace) !== JSON.stringify(activeWorkspace);
  if (isDifferent) {
    activeWorkspace = workspace;
    workspaceVersion++;
  }

  return res.json({
    success: true,
    message: isDifferent ? "Workspace successfully updated on the studio, bumping version." : "Workspace already in sync.",
    version: workspaceVersion,
    workspace: activeWorkspace
  });
});

/**
 * POST /api/agent/deploy
 * Compiles and deploys the workspace directly into the configured X4 Extensions directory.
 */
app.post("/api/agent/deploy", (req, res) => {
  const ws = req.body.workspace || activeWorkspace;
  try {
    const resolved = resolveXsdConfig();
    const x4GamePath = resolved.x4GamePath;
    if (!x4GamePath) {
      return res.status(400).json({
        success: false,
        error: "X4 Game Installation path is not configured on the server."
      });
    }

    if (!fs.existsSync(x4GamePath)) {
      return res.status(400).json({
        success: false,
        error: `X4 Game Installation path "${x4GamePath}" does not exist on the server filesystem.`
      });
    }

    const extensionsPath = path.join(x4GamePath, 'extensions');
    if (!fs.existsSync(extensionsPath)) {
      fs.mkdirSync(extensionsPath, { recursive: true });
    }

    const modId = toSafeModId(ws.name);
    const modPath = path.join(extensionsPath, modId);

    // Clean old mod directory if exists
    if (fs.existsSync(modPath)) {
      fs.rmSync(modPath, { recursive: true, force: true });
    }
    fs.mkdirSync(modPath, { recursive: true });

    // 1. content.xml
    const contentXml = generateContentXML(modId, ws);
    fs.writeFileSync(path.join(modPath, 'content.xml'), contentXml);

    // 2. md/<modId>.xml
    const mdXml = generateMDXML(ws);
    const mdDir = path.join(modPath, 'md');
    fs.mkdirSync(mdDir, { recursive: true });
    fs.writeFileSync(path.join(mdDir, `${modId}.xml`), mdXml);

    // 3. UI
    if (ws.uiWidgets?.length) {
      const uiDir = path.join(modPath, 'md_ui_layouts');
      fs.mkdirSync(uiDir, { recursive: true });
      const uiXml = generateUIXML(ws);
      fs.writeFileSync(path.join(uiDir, `${modId}_ui.xml`), uiXml);
    }

    // 4. AIScripts
    if (ws.aiScripts?.length) {
      const aiDir = path.join(modPath, 'aiscripts');
      fs.mkdirSync(aiDir, { recursive: true });
      for (const script of ws.aiScripts) {
        const fileName = script.name.endsWith('.xml') ? script.name : `${script.name}.xml`;
        fs.writeFileSync(path.join(aiDir, fileName), compileScriptToXML(script));
      }
    }

    // 5. Wares and Jobs
    if (ws.wares?.length || ws.jobs?.length) {
      const libDir = path.join(modPath, 'libraries');
      fs.mkdirSync(libDir, { recursive: true });
      if (ws.wares?.length) {
        fs.writeFileSync(path.join(libDir, 'wares.xml'), compileWaresXML(ws.wares));
      }
      if (ws.jobs?.length) {
        fs.writeFileSync(path.join(libDir, 'jobs.xml'), compileJobsXML(ws.jobs));
      }
    }

    // 6. Translations
    if (ws.tFiles?.length) {
      const tDir = path.join(modPath, 't');
      fs.mkdirSync(tDir, { recursive: true });
      for (const tFile of ws.tFiles) {
        const fileName = tFile.fileName || `0001-L${tFile.languageId}.xml`;
        fs.writeFileSync(path.join(tDir, fileName), compileTFileXML(tFile));
      }
    }

    // 7. XML diff patches
    if (ws.xmlPatches?.length) {
      const patchesByFile: Record<string, any[]> = {};
      ws.xmlPatches.forEach((patch: any) => {
        const file = patch.targetFile || 'libraries/ship_macros.xml';
        if (!patchesByFile[file]) {
          patchesByFile[file] = [];
        }
        patchesByFile[file].push(patch);
      });

      for (const [filePath, filePatches] of Object.entries(patchesByFile)) {
        const targetFilePath = path.join(modPath, filePath);
        const targetDir = path.dirname(targetFilePath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.writeFileSync(targetFilePath, compileDiffDocument(filePatches, filePath));
      }
    }

    return res.json({
      success: true,
      message: `Successfully deployed mod "${ws.name}" to game extensions folder.`,
      deployedPath: modPath
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to deploy mod to extensions folder."
    });
  }
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

function populateNodeMetadata(nodes: any[]): any[] {
  if (!nodes || !Array.isArray(nodes)) return [];
  return nodes.map(node => {
    // Attempt to match by xmlTag
    let template = NODE_TEMPLATES.find(t => t.xmlTag === node.xmlTag);
    if (!template) {
      template = schemaTemplatesByTag.get(node.xmlTag);
    }
    // Fallback search by type
    if (!template) {
      template = NODE_TEMPLATES.find(t => t.type === node.type);
    }
    // Deep fallback to first template
    if (!template) {
      template = NODE_TEMPLATES[0];
    }
    
    return {
      id: node.id || `node_${Math.random().toString(36).substring(2, 9)}`,
      type: node.type || template.type,
      label: node.label || template.label,
      xmlTag: node.xmlTag || template.xmlTag,
      x: typeof node.x === 'number' ? node.x : Math.floor(Math.random() * 500) + 100,
      y: typeof node.y === 'number' ? node.y : Math.floor(Math.random() * 400) + 100,
      properties: { ...template.properties, ...node.properties },
      propertiesSchema: template.propertiesSchema,
      inputs: template.inputs,
      outputs: template.outputs,
      comment: node.comment || ""
    };
  });
}

/**
 * POST /api/agent/generate
 * Prompts the built-in Gemini language model to map a natural language instruction directly
 * into a highly complex, logical ModWorkspace structured JSON value.
 */
app.post("/api/agent/generate", async (req, res) => {
  const { prompt, currentWorkspace, diagnostics } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Missing 'prompt' body parameter." });
  }

  try {
    console.log(`[AI-STUDIO] Starting Phased Cognitive Prompt Interpretation Workflow...`);
    
    // --- PHASE 1: CORE NODE BLUEPRINT INTERPRETER ---
    console.log(`[AI-STUDIO] [Phase 1/4] Interrogating Intent & Node Visual Setup...`);
    const phase1System = `You are Phase 1 of a visual workspace translator. Design or edit ONLY the workspace metadata (name, version, author, description) and the raw "nodes" array based on the user's raw prompt.
Do not worry about linkages / links or uiWidgets. 
Focus on allocating:
1. Cue nodes (type="cue", xmlTag="cue") representing mission cues.
2. Event/Condition nodes (type="event" or type="condition") representing triggers/checks. Available xmlTags: "event_cue_signalled", "event_object_destroyed", "event_object_changed_sector", "check_value", "custom_event", "custom_condition".
3. Action nodes (type="action") representing actions. Available xmlTags: "create_ship", "reward_player", "play_sound", "show_help", "create_station", "custom_xml".

Ensure each node has a unique 'id' (e.g., 'cue_0', 'event_0', 'action_0', etc.) and appropriate 'properties' matching their template.
Position nodes clearly: Cues on the left, conditions to their right, and action chains horizontally to the right.`;

    const phase1Schema = {
      type: Type.OBJECT,
      required: ["name", "version", "author", "description", "nodes"],
      properties: {
        name: { type: Type.STRING, description: "Alphanumeric mod name with underscores, e.g. Bounty_Killer_Mod" },
        version: { type: Type.STRING },
        author: { type: Type.STRING },
        description: { type: Type.STRING },
        nodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ["id", "type", "label", "xmlTag", "x", "y", "properties"],
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, description: "cue, event, condition, or action" },
              label: { type: Type.STRING },
              xmlTag: { type: Type.STRING },
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              properties: {
                type: Type.OBJECT,
                description: "Properties for the node. E.g. for cue: {name, instantiate, namespace, state}. For event/condition/action: relevant keys according to their templates."
              },
              comment: { type: Type.STRING }
            }
          }
        }
      }
    };

    let phase1Prompt = `Prompt: "${prompt}"`;
    if (currentWorkspace) {
      const promptNodes = (currentWorkspace.nodes || []).map((node: any) => ({
        id: node.id,
        type: node.type,
        label: node.label,
        xmlTag: node.xmlTag,
        x: node.x,
        y: node.y,
        properties: node.properties
      }));
      phase1Prompt = `You are modifying an existing ModWorkspace layout.
[Current Workspace Structure]:
- Name: "${currentWorkspace.name}"
- Version: "${currentWorkspace.version || "1.0.0"}"
- Author: "${currentWorkspace.author || ""}"
- Description: "${currentWorkspace.description || ""}"
- Current Nodes: ${JSON.stringify(promptNodes)}

Modify these nodes or add new ones to satisfy this prompt:
"${prompt}"

Maintain as many existing nodes as possible unless they require replacement.`;
    }

    const phase1RawResult = await callMultiProviderAI(req, phase1System, phase1Prompt, "json", phase1Schema);
    const phase1Result = JSON.parse(phase1RawResult.trim());
    
    // Auto-populate port signatures and property schemas from source dictionary to ensure 100% compliance
    const populatedNodes = populateNodeMetadata(phase1Result.nodes);

    // --- PHASE 2: RELATIONAL WIRE LOGIC LINKEAGES ---
    console.log(`[AI-STUDIO] [Phase 2/4] Constructing Relational Wire Linkages...`);
    const phase2System = `You are Phase 2 of a visual workspace translator. Given the populated list of visual nodes (cues, events, conditions, actions), define how they connect together.
Return ONLY the links connection list matching the specified JSON schema.

CRITICAL LINKING RULES:
1. Connect conditions/events to their cue: sourceNodeId is the cue, sourcePortId="out_cond", targetNodeId is the event/condition, targetPortId="in_cond".
2. Connect the first action of a cue: sourceNodeId is the cue, sourcePortId="out_act", targetNodeId is the first action, targetPortId="in_act".
3. Chain subsequent actions together: sourceNodeId is the previous action, sourcePortId="out_next", targetNodeId is the next action, targetPortId="in_act".
4. Connect child cues to parent cues for nested sub-cues: sourceNodeId is parent, sourcePortId="out_sub", targetNodeId is the child cue, targetPortId="in_flow".`;

    const phase2Schema = {
      type: Type.OBJECT,
      required: ["links"],
      properties: {
        links: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ["id", "sourceNodeId", "sourcePortId", "targetNodeId", "targetPortId"],
            properties: {
              id: { type: Type.STRING },
              sourceNodeId: { type: Type.STRING, description: "ID of the source node" },
              sourcePortId: { type: Type.STRING, description: "out_cond, out_act, out_next, or out_sub" },
              targetNodeId: { type: Type.STRING, description: "ID of the target node" },
              targetPortId: { type: Type.STRING, description: "in_cond, in_act, or in_flow" }
            }
          }
        }
      }
    };

    const phase2Prompt = `Construct logic link arrays for this workspace layout.
[Populated Nodes Layout]:
${JSON.stringify(populatedNodes.map(n => ({ id: n.id, label: n.label, type: n.type, xmlTag: n.xmlTag, inputs: n.inputs, outputs: n.outputs })))}

[User Prompt Requirement Context]:
"${prompt}"

Please connect the nodes logically. For example, connect a Cue node's outputs ('out_cond' / 'out_act') to its associated Event or Action node inputs ('in_cond' / 'in_act').`;

    const phase2RawResult = await callMultiProviderAI(req, phase2System, phase2Prompt, "json", phase2Schema);
    const phase2Result = JSON.parse(phase2RawResult.trim());

    // --- PHASE 3: HUD USER CONTROL INTERFACES ---
    console.log(`[AI-STUDIO] [Phase 3/4] Designing Graphic Interface Control overlays...`);
    const phase3System = `You are Phase 3 of a visual workspace translator. Design or edit active web graphic HUD dashboard widgets and custom UI themes that fit the mod behavior.
Ensure that smaller UI elements (progressbar, buttons, checkboxes, input text) are styled and positioned visually inside container "window" elements (w, h heights).
Return ONLY the uiWidgets and uiTheme block fit.`;

    const phase3Schema = {
      type: Type.OBJECT,
      required: ["uiWidgets", "uiTheme"],
      properties: {
        uiWidgets: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ["id", "type", "x", "y", "w", "h", "label", "properties"],
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, description: "window, table, button, progressbar, check, text, dropdown, header, input, chat" },
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

    const currentUIWidgets = currentWorkspace?.uiWidgets || [];
    const currentUITheme = currentWorkspace?.uiTheme || {
      backgroundColor: "#0d1117",
      borderColor: "#df9825",
      accentColor: "#f39c12",
      opacity: 0.85,
      showIcons: true
    };

    const phase3Prompt = `Add or adjust visual HUD display control widgets.
[User Request]:
"${prompt}"

[Nodes Created]:
${JSON.stringify(populatedNodes.map(n => ({ id: n.id, label: n.label, xmlTag: n.xmlTag })))}

[Current HUD widgets]:
${JSON.stringify(currentUIWidgets)}

Create, update, or reposition HUD window containers and nested controller elements to fit the mod. Return the compiled array.`;

    const phase3RawResult = await callMultiProviderAI(req, phase3System, phase3Prompt, "json", phase3Schema);
    const phase3Result = JSON.parse(phase3RawResult.trim());

    // --- PACK COMBINED EXPERIMENT STAGE ---
    let combinedWorkspace: ModWorkspace = {
      id: `workspace_${Date.now()}`,
      name: phase1Result.name || (currentWorkspace?.name || "My_Custom_Mod"),
      version: phase1Result.version || (currentWorkspace?.version || "1.0.0"),
      author: phase1Result.author || (currentWorkspace?.author || "Player"),
      description: phase1Result.description || (currentWorkspace?.description || ""),
      nodes: populatedNodes,
      links: phase2Result.links || [],
      uiWidgets: phase3Result.uiWidgets || [],
      uiTheme: phase3Result.uiTheme || currentUITheme
    };

    // --- PHASE 4: EXPERT SCHEMA SELF-REPAIR SANITY VET ---
    console.log(`[AI-STUDIO] [Phase 4/4] Executing Egosoft Schema Verification & Healing...`);
    const currentCode = generateMDXML(combinedWorkspace);
    const validationDiagnostics = validateModWorkspace(combinedWorkspace, currentCode);

    if (validationDiagnostics.length > 0) {
      console.log(`[AI-STUDIO] Validation reported ${validationDiagnostics.length} warnings. Running auto-remedy fix...`);
      
      const phase4System = `You are Phase 4 (Self-Healing Compiler) for the X4 Foundations visual editor.
The generated workspace layout currently fails Egosoft's visual schema checks with specific warnings/errors.
Study the diagnostics report, apply corrections to the nodes, properties, and links, and return the absolute complete ModWorkspace JSON.

CRITICAL COMPLIANCE RULES:
1. Visual Event, Condition, and Action nodes must be linked correctly to their respective parent Cue node.
2. Conditions/events connect via Cue's out_cond to Condition's in_cond.
3. Actions connect sequentially starting from Cue's out_act to first Action's in_act, then Action's out_next to next Action's in_act.
4. Child cues connect via parent Cue's out_sub to child Cue's in_flow.`;

      const phase4Schema = {
        type: Type.OBJECT,
        required: ["name", "version", "author", "description", "nodes", "links", "uiWidgets", "uiTheme"],
        properties: {
          name: { type: Type.STRING },
          version: { type: Type.STRING },
          author: { type: Type.STRING },
          description: { type: Type.STRING },
          nodes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["id", "type", "label", "xmlTag", "x", "y", "properties"],
              properties: {
                id: { type: Type.STRING },
                type: { type: Type.STRING },
                label: { type: Type.STRING },
                xmlTag: { type: Type.STRING },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                properties: {
                  type: Type.OBJECT,
                  description: "Properties for the node. E.g. for cue: {name, instantiate, namespace, state}. For event/condition/action: relevant keys according to their templates."
                },
                comment: { type: Type.STRING }
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
          uiWidgets: { type: Type.ARRAY, items: { type: Type.OBJECT } },
          uiTheme: { type: Type.OBJECT }
        }
      };

      const phase4Prompt = `Correct the layout parameters of this ModWorkspace structure.
[Damaged Workspace Layout]:
${JSON.stringify({
  name: combinedWorkspace.name,
  description: combinedWorkspace.description,
  nodes: combinedWorkspace.nodes.map(n => ({ id: n.id, xmlTag: n.xmlTag, properties: n.properties })),
  links: combinedWorkspace.links
})}

[Egosoft Validation Diagnostics Code Reports]:
${JSON.stringify(validationDiagnostics, null, 2)}

Please edit the links or properties to resolve all errors in the diagnostic suite. Output the corrected variables.`;

      try {
        const phase4Raw = await callMultiProviderAI(req, phase4System, phase4Prompt, "json", phase4Schema);
        const phase4Result = JSON.parse(phase4Raw.trim());
        
        // Re-populate system metadata to guarantee property schemas remain undamaged
        const fixedNodes = populateNodeMetadata(phase4Result.nodes);
        
        combinedWorkspace = {
          ...combinedWorkspace,
          name: phase4Result.name || combinedWorkspace.name,
          nodes: fixedNodes,
          links: phase4Result.links || combinedWorkspace.links,
          uiWidgets: phase4Result.uiWidgets || combinedWorkspace.uiWidgets,
          uiTheme: phase4Result.uiTheme || combinedWorkspace.uiTheme
        };
        console.log(`[AI-STUDIO] Phased Auto-Remedy cycle completed successfully.`);
      } catch (repairErr) {
        console.warn(`[AI-STUDIO] Self-heal attempt failed (ignoring, falling back to base layout):`, repairErr);
      }
    } else {
      console.log(`[AI-STUDIO] Verification complete: pristine schema validated on first run.`);
    }

    // Apply globally to the shared space
    activeWorkspace = combinedWorkspace;
    workspaceVersion++;

    console.log(`[AI-STUDIO] Phased interpretation complete. Delivered blueprint named: ${combinedWorkspace.name}`);

    const finalCode = generateMDXML(combinedWorkspace);
    const finalDiagnostics = validateModWorkspace(combinedWorkspace, finalCode);

    return res.json({
      success: true,
      message: "AI Agent successfully designed and applied a new mod schema to the workspace in 4 distinct high-fidelity phases!",
      version: workspaceVersion,
      workspace: combinedWorkspace,
      diagnostics: finalDiagnostics,
      selfHealFailed: validationDiagnostics.length > 0 && finalDiagnostics.length > 0
    });

  } catch (error: any) {
    console.error("AI Agent layout generation error: ", error);
    return res.status(500).json({
      error: error.message || "Failed to trigger automated workspace planner in phased execution mode."
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
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`X4 Mod Studio Dev Server running on http://127.0.0.1:${PORT}`);
  });
}).catch(err => {
  console.error("Server failure: ", err);
});
