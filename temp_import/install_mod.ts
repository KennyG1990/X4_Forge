import fs from 'fs';
import path from 'path';
import { 
  generateMDXML, 
  generateUIXML 
} from './src/types';
import { 
  toSafeModId, 
  generateContentXML, 
  compileScriptToXML, 
  compileWaresXML, 
  compileJobsXML, 
  compileTFileXML, 
  compileDiffDocument 
} from './src/lib/modCompiler';

function readStudioApiToken() {
  if (process.env.STUDIO_API_TOKEN?.trim()) {
    return process.env.STUDIO_API_TOKEN.trim();
  }
  return fs.readFileSync('.studio-api-token', 'utf8').trim();
}

async function main() {
  // 1. Read the same local token the server injects into the app HTML.
  const token = readStudioApiToken();
  console.log("Token retrieved successfully.");

  // 2. Fetch active workspace from server using token
  console.log("Fetching active workspace...");
  const wsResponse = await fetch('http://127.0.0.1:3000/api/agent/workspace', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (!wsResponse.ok) {
    throw new Error(`Failed to fetch active workspace from server (HTTP ${wsResponse.status}).`);
  }
  const { workspace } = await wsResponse.json();
  console.log(`Loaded workspace: "${workspace.name}" by "${workspace.author}"`);

  // 3. Read config to get X4 game path
  const configContent = fs.readFileSync('config.json', 'utf8');
  const config = JSON.parse(configContent);
  const x4GamePath = config.x4GamePath;
  if (!x4GamePath) {
    throw new Error('x4GamePath is not configured in config.json.');
  }
  console.log(`X4 Game Path: "${x4GamePath}"`);

  const extensionsPath = path.join(x4GamePath, 'extensions');
  if (!fs.existsSync(extensionsPath)) {
    fs.mkdirSync(extensionsPath, { recursive: true });
  }

  const modId = toSafeModId(workspace.name);
  const modPath = path.join(extensionsPath, modId);
  console.log(`Installing mod to: "${modPath}"`);

  // Clean old mod directory if exists
  if (fs.existsSync(modPath)) {
    fs.rmSync(modPath, { recursive: true, force: true });
  }
  fs.mkdirSync(modPath, { recursive: true });

  // 1. content.xml
  const contentXml = generateContentXML(modId, workspace);
  fs.writeFileSync(path.join(modPath, 'content.xml'), contentXml);
  console.log("- content.xml written.");

  // 2. md/<modId>.xml
  const mdXml = generateMDXML(workspace);
  const mdDir = path.join(modPath, 'md');
  fs.mkdirSync(mdDir, { recursive: true });
  fs.writeFileSync(path.join(mdDir, `${modId}.xml`), mdXml);
  console.log(`- md/${modId}.xml written.`);

  // 3. UI
  if (workspace.uiWidgets?.length) {
    const uiDir = path.join(modPath, 'md_ui_layouts');
    fs.mkdirSync(uiDir, { recursive: true });
    const uiXml = generateUIXML(workspace);
    fs.writeFileSync(path.join(uiDir, `${modId}_ui.xml`), uiXml);
    console.log("- md_ui_layouts written.");
  }

  // 4. AIScripts
  if (workspace.aiScripts?.length) {
    const aiDir = path.join(modPath, 'aiscripts');
    fs.mkdirSync(aiDir, { recursive: true });
    for (const script of workspace.aiScripts) {
      const fileName = script.name.endsWith('.xml') ? script.name : `${script.name}.xml`;
      fs.writeFileSync(path.join(aiDir, fileName), compileScriptToXML(script));
    }
    console.log("- aiscripts written.");
  }

  // 5. Wares and Jobs
  if (workspace.wares?.length || workspace.jobs?.length) {
    const libDir = path.join(modPath, 'libraries');
    fs.mkdirSync(libDir, { recursive: true });
    if (workspace.wares?.length) {
      fs.writeFileSync(path.join(libDir, 'wares.xml'), compileWaresXML(workspace.wares));
    }
    if (workspace.jobs?.length) {
      fs.writeFileSync(path.join(libDir, 'jobs.xml'), compileJobsXML(workspace.jobs));
    }
    console.log("- libraries written.");
  }

  // 6. Translations
  if (workspace.tFiles?.length) {
    const tDir = path.join(modPath, 't');
    fs.mkdirSync(tDir, { recursive: true });
    for (const tFile of workspace.tFiles) {
      const fileName = tFile.fileName || `0001-L${tFile.languageId}.xml`;
      fs.writeFileSync(path.join(tDir, fileName), compileTFileXML(tFile));
    }
    console.log("- t files written.");
  }

  // 7. XML diff patches
  if (workspace.xmlPatches?.length) {
    const patchesByFile: Record<string, any[]> = {};
    workspace.xmlPatches.forEach((patch: any) => {
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
    console.log("- xml patches written.");
  }

  console.log(`\nMod "${workspace.name}" installed successfully to game extensions directory!`);
}

main().catch(err => {
  console.error('Error during installation:', err);
  process.exit(1);
});
