/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Settings, 
  Trash, 
  Plus, 
  Wrench, 
  Sparkles, 
  Database, 
  HelpCircle, 
  ShoppingBag, 
  Anchor, 
  Code2, 
  ChevronRight,
  GitPullRequest,
  BadgeAlert,
  AlertTriangle
} from 'lucide-react';
import { ModWorkspace } from '../types';

interface LibraryConfiguratorProps {
  workspace: ModWorkspace;
  setWorkspace: React.Dispatch<React.SetStateAction<ModWorkspace>>;
}

export interface WareDef {
  id: string;
  name: string;
  description: string;
  transport: 'container' | 'liquid' | 'solid' | 'energy';
  volume: number;
  minPrice: number;
  avgPrice: number;
  maxPrice: number;
  prodTime: number;
  prodAmount: number;
}

export interface JobDef {
  id: string;
  name: string;
  faction: string;
  shipClass: 'fighter' | 'corvette' | 'destroyer' | 'carrier' | 'freighter';
  shipMacro: string;
  galaxyQuota: number;
  sectorQuota: number;
  taskScript: string;
  rebuildOnDestroy: boolean;
}

export interface ConflictWarning {
  id: string;
  severity: 'error' | 'warning' | 'info';
  category: 'id_collision' | 'overlap' | 'validation' | 'pricing';
  title: string;
  message: string;
  affectedIds: string[];
  location: string;
}

export default function LibraryConfigurator({ workspace, setWorkspace }: LibraryConfiguratorProps) {
  const [activeSubTab, setActiveSubTab] = useState<'wares' | 'jobs'>('wares');
  const [activeItemIndex, setActiveItemIndex] = useState<number>(0);
  const [isPatchMode, setIsPatchMode] = useState<boolean>(true);
  const [warnings, setWarnings] = useState<ConflictWarning[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [warningsExpanded, setWarningsExpanded] = useState<boolean>(true);

  // High fidelity default arrays
  const defaultWares: WareDef[] = [
    {
      id: 'ware_quantum_injectors',
      name: 'Quantum Engine Injectors',
      description: 'Super-efficient fuel compression injectors used in advanced high-speed capital engines.',
      transport: 'container',
      volume: 8,
      minPrice: 420,
      avgPrice: 850,
      maxPrice: 1600,
      prodTime: 45,
      prodAmount: 4
    },
    {
      id: 'ware_fusion_conductors',
      name: 'High-Temp Fusion Conductors',
      description: 'Superconducting alloy links that distribute stable energy payloads to magnetic rail accelerators.',
      transport: 'container',
      volume: 12,
      minPrice: 800,
      avgPrice: 1250,
      maxPrice: 2400,
      prodTime: 60,
      prodAmount: 2
    }
  ];

  const defaultJobs: JobDef[] = [
    {
      id: 'job_argon_patrol_elite_escort',
      name: 'Argon Vanguard Strategic Escort Force',
      faction: 'argon',
      shipClass: 'fighter',
      shipMacro: 'ship_arg_s_fighter_01_a_macro',
      galaxyQuota: 12,
      sectorQuota: 3,
      taskScript: 'hunter.escort.behavior',
      rebuildOnDestroy: true
    },
    {
      id: 'job_xenon_destroyer_offensive',
      name: 'Xenon Sector Harassment Fleet',
      faction: 'xenon',
      shipClass: 'destroyer',
      shipMacro: 'ship_xen_k_destroyer_01_macro',
      galaxyQuota: 4,
      sectorQuota: 1,
      taskScript: 'commander.patrol.xenon',
      rebuildOnDestroy: true
    }
  ];

  const wares = workspace.wares || [];
  const jobs = workspace.jobs || [];

  const scanProjectFilesForConflicts = async () => {
    setIsScanning(true);
    const foundWarnings: ConflictWarning[] = [];
    
    // 1. Collect all custom registries in workspace + defaults
    const registryWares = wares;
    const registryJobs = jobs;

    const wareDefsMap = new Map<string, Array<{ id: string; name?: string; source: string; details?: string }>>();
    const jobDefsMap = new Map<string, Array<{ id: string; name?: string; source: string; details?: any }>>();

    // Populate active workspace registry
    registryWares.forEach(w => {
      const list = wareDefsMap.get(w.id) || [];
      list.push({ id: w.id, name: w.name, source: 'Workspace Registry' });
      wareDefsMap.set(w.id, list);
      
      // Pricing rules validation
      if (w.minPrice >= w.maxPrice) {
        foundWarnings.push({
          id: `price_floor_${w.id}`,
          severity: 'error',
          category: 'pricing',
          title: 'Invalid pricing range',
          message: `Min price (${w.minPrice} cr) is greater/equal to Max price (${w.maxPrice} cr) for '${w.id}'. X4 engine rejects unstable boundaries.`,
          affectedIds: [w.id],
          location: 'Workspace Registry'
        });
      }
      if (w.avgPrice < w.minPrice || w.avgPrice > w.maxPrice) {
        foundWarnings.push({
          id: `price_avg_${w.id}`,
          severity: 'warning',
          category: 'pricing',
          title: 'Average price anomalous',
          message: `Average price (${w.avgPrice} cr) must reside between Min floor and Max ceiling.`,
          affectedIds: [w.id],
          location: 'Workspace Registry'
        });
      }
    });

    registryJobs.forEach(j => {
      const list = jobDefsMap.get(j.id) || [];
      list.push({ id: j.id, name: j.name, source: 'Workspace Registry', details: j });
      jobDefsMap.set(j.id, list);

      // Validation warnings
      if (j.galaxyQuota <= 0) {
        foundWarnings.push({
          id: `quota_gal_${j.id}`,
          severity: 'error',
          category: 'validation',
          title: 'Zero quota limit',
          message: `Galaxy quota for job '${j.id}' is 0. No ships under this design will ever spawn.`,
          affectedIds: [j.id],
          location: 'Workspace Registry'
        });
      }
      if (j.sectorQuota > j.galaxyQuota) {
        foundWarnings.push({
          id: `quota_sec_${j.id}`,
          severity: 'warning',
          category: 'validation',
          title: 'Sector quota exceeds Galaxy',
          message: `Sector quota limit (${j.sectorQuota}) is greater than Galaxy quota (${j.galaxyQuota}). Spawn volumes will be capped by galaxy volume.`,
          affectedIds: [j.id],
          location: 'Workspace Registry'
        });
      }
    });

    // 2. Scan xmlPatches built-in or custom blocks
    const patches = workspace.xmlPatches || [];
    patches.forEach(p => {
      const xmlContent = p.content || '';
      
      // Regex match wares
      const wareRegex = /<ware\s+id=["']([^"']+)["']/g;
      let wareMatch;
      while ((wareMatch = wareRegex.exec(xmlContent)) !== null) {
        const wareId = wareMatch[1];
        const nameMatch = xmlContent.match(/name=["']([^"']+)["']/);
        const wareName = nameMatch ? nameMatch[1] : undefined;
        const patchSource = `XML Patch Block: "${p.note || p.id}"`;
        
        const list = wareDefsMap.get(wareId) || [];
        list.push({ id: wareId, name: wareName, source: patchSource });
        wareDefsMap.set(wareId, list);
      }

      // Regex match jobs
      const jobRegex = /<job\s+id=["']([^"']+)["']/g;
      let jobMatch;
      while ((jobMatch = jobRegex.exec(xmlContent)) !== null) {
        const jobId = jobMatch[1];
        const nameMatch = xmlContent.match(/name=["']([^"']+)["']/);
        const jobName = nameMatch ? nameMatch[1] : undefined;
        const patchSource = `XML Patch Block: "${p.note || p.id}"`;
        
        const factionMatch = xmlContent.match(/faction=["']([^"']+)["']/);
        const tagMatch = xmlContent.match(/tags=["']([^"']+)["']/);
        const scriptMatch = xmlContent.match(/script=["']([^"']+)["']/);
        
        const dummyJob = {
          faction: factionMatch ? factionMatch[1] : '',
          shipClass: tagMatch ? tagMatch[1] : '',
          taskScript: scriptMatch ? scriptMatch[1] : ''
        };

        const list = jobDefsMap.get(jobId) || [];
        list.push({ id: jobId, name: jobName, source: patchSource, details: dummyJob });
        jobDefsMap.set(jobId, list);
      }
    });

    // 3. Scan physical XML files on disk under /libraries/ directories
    try {
      const listRes = await fetch('/api/fs/list');
      if (listRes.ok) {
        const tree = await listRes.json();
        
        const flattenFiles = (nodes: any[]): any[] => {
          let results: any[] = [];
          if (!nodes || !Array.isArray(nodes)) return results;
          nodes.forEach(n => {
            if (n.kind === 'file') {
              results.push(n);
            } else if (n.kind === 'directory' && n.children) {
              results = [...results, ...flattenFiles(n.children)];
            }
          });
          return results;
        };
        
        const allFiles = flattenFiles(tree);
        const xmlFiles = allFiles.filter(f => f.name && f.name.endsWith('.xml') && f.path && f.path.includes('/libraries/'));
        
        for (const file of xmlFiles) {
          try {
            const readRes = await fetch(`/api/fs/read?path=${encodeURIComponent(file.path)}`);
            if (readRes.ok) {
              const data = await readRes.json();
              const fileContent = data.content || '';
              const relativePath = file.path.split('/workspace/').pop() || file.path;
              
              // Wares matching
              const wareRegex = /<ware\s+id=["']([^"']+)["']/g;
              let fileWareMatch;
              while ((fileWareMatch = wareRegex.exec(fileContent)) !== null) {
                const wareId = fileWareMatch[1];
                const subBlock = fileContent.substring(fileWareMatch.index, fileWareMatch.index + 250);
                const nameMatch = subBlock.match(/name=["']([^"']+)["']/);
                const wareName = nameMatch ? nameMatch[1] : undefined;
                
                const list = wareDefsMap.get(wareId) || [];
                list.push({ id: wareId, name: wareName, source: `Local Disk: ${relativePath}` });
                wareDefsMap.set(wareId, list);
              }

              // Jobs matching
              const jobRegex = /<job\s+id=["']([^"']+)["']/g;
              let fileJobMatch;
              while ((fileJobMatch = jobRegex.exec(fileContent)) !== null) {
                const jobId = fileJobMatch[1];
                const subBlock = fileContent.substring(fileJobMatch.index, fileJobMatch.index + 400);
                const nameMatch = subBlock.match(/name=["']([^"']+)["']/);
                const jobName = nameMatch ? nameMatch[1] : undefined;
                
                const factionMatch = subBlock.match(/faction=["']([^"']+)["']/);
                const tagsMatch = subBlock.match(/tags=["']([^"']+)["']/);
                const scriptMatch = subBlock.match(/script=["']([^"']+)["']/);
                
                const dummyJob = {
                  faction: factionMatch ? factionMatch[1] : '',
                  shipClass: tagsMatch ? tagsMatch[1] : '',
                  taskScript: scriptMatch ? scriptMatch[1] : ''
                };

                const list = jobDefsMap.get(jobId) || [];
                list.push({ id: jobId, name: jobName, source: `Local Disk: ${relativePath}`, details: dummyJob });
                jobDefsMap.set(jobId, list);
              }
            }
          } catch (fileErr) {
            console.error("Local file conflict check read failed for:", file.path, fileErr);
          }
        }
      }
    } catch (fsErr) {
      console.warn("FS scanning issue, falling back to memory arrays:", fsErr);
    }

    // 4. Duplicate ID collision evaluation
    wareDefsMap.forEach((sources, wareId) => {
      if (sources.length > 1) {
        const distinctSources = Array.from(new Set(sources.map(s => s.source)));
        if (distinctSources.length > 1) {
          foundWarnings.push({
            id: `conflict_ware_${wareId}`,
            severity: 'error',
            category: 'id_collision',
            title: `Ware ID Conflict: '${wareId}'`,
            message: `The precise Ware ID is defined across overlapping resources: ${distinctSources.join(' AND ')}. Will cause silent overwritten errors.`,
            affectedIds: [wareId],
            location: distinctSources.join(' vs ')
          });
        }
      }
    });

    jobDefsMap.forEach((sources, jobId) => {
      if (sources.length > 1) {
        const distinctSources = Array.from(new Set(sources.map(s => s.source)));
        if (distinctSources.length > 1) {
          foundWarnings.push({
            id: `conflict_job_${jobId}`,
            severity: 'error',
            category: 'id_collision',
            title: `Job ID Conflict: '${jobId}'`,
            message: `This Pilot Squad Job ID is declared in multiple file locations: ${distinctSources.join(' AND ')}. Engine parses only one.`,
            affectedIds: [jobId],
            location: distinctSources.join(' vs ')
          });
        }
      }
    });

    // 5. Overlapping Jobs diagnostics (same faction, class tag, task behaviors)
    const allJobsList: Array<{ id: string; name?: string; source: string; details: any }> = [];
    jobDefsMap.forEach((sources, jobId) => {
      sources.forEach(s => {
        if (s.details) {
          allJobsList.push({ id: jobId, name: s.name, source: s.source, details: s.details });
        }
      });
    });

    for (let i = 0; i < allJobsList.length; i++) {
      for (let j = i + 1; j < allJobsList.length; j++) {
        const jobA = allJobsList[i];
        const jobB = allJobsList[j];
        
        if (jobA.id === jobB.id) continue;

        const fA = String(jobA.details.faction || '').trim().toLowerCase();
        const fB = String(jobB.details.faction || '').trim().toLowerCase();
        const sClassA = String(jobA.details.shipClass || '').trim().toLowerCase();
        const sClassB = String(jobB.details.shipClass || '').trim().toLowerCase();
        const scriptA = String(jobA.details.taskScript || '').trim().toLowerCase();
        const scriptB = String(jobB.details.taskScript || '').trim().toLowerCase();

        const factionOverlap = fA && fB && (fA === fB || fA.includes(fB) || fB.includes(fA));
        const classOverlap = sClassA && sClassB && (sClassA === sClassB || sClassA.includes(sClassB) || sClassB.includes(sClassA));
        const scriptOverlap = scriptA && scriptB && (scriptA === scriptB || scriptA.includes(scriptB) || scriptB.includes(scriptA));

        if (factionOverlap && classOverlap && scriptOverlap) {
          foundWarnings.push({
            id: `overlap_job_${jobA.id}_${jobB.id}`,
            severity: 'warning',
            category: 'overlap',
            title: `Overlapping NPC Flight Roles`,
            message: `Job '${jobA.id}' (${jobA.source}) and Job '${jobB.id}' (${jobB.source}) share faction parameters (${jobA.details.faction}) and script logic (${jobA.details.taskScript}). Can saturate local patrol quota boundaries.`,
            affectedIds: [jobA.id, jobB.id],
            location: `${jobA.source} VS ${jobB.source}`
          });
        }
      }
    }

    setWarnings(foundWarnings);
    setIsScanning(false);
  };

  React.useEffect(() => {
    scanProjectFilesForConflicts();
  }, [workspace.wares, workspace.jobs, workspace.xmlPatches]);

  const saveWares = (newWares: WareDef[]) => {
    setWorkspace(prev => ({
      ...prev,
      wares: newWares
    }));
  };

  const saveJobs = (newJobs: JobDef[]) => {
    setWorkspace(prev => ({
      ...prev,
      jobs: newJobs
    }));
  };

  const handleCreateWare = () => {
    const wId = prompt("Enter Unique Ware ID (e.g., ware_antimatter_capsules):", "ware_quantum_crystals");
    if (!wId) return;
    
    const nWare: WareDef = {
      id: wId.startsWith('ware_') ? wId : `ware_${wId}`,
      name: "Quantum Focus Crystals",
      description: "Highly volatile carbon lattices that refract focus laser beam emitters.",
      transport: 'container',
      volume: 4,
      minPrice: 180,
      avgPrice: 350,
      maxPrice: 720,
      prodTime: 30,
      prodAmount: 10
    };

    const next = [...wares, nWare];
    saveWares(next);
    setActiveItemIndex(wares.length);
  };

  const handleCreateJob = () => {
    const jId = prompt("Enter Unique Job ID (e.g., job_trader_hauler):", "job_pirate_harasser");
    if (!jId) return;

    const nJob: JobDef = {
      id: jId.startsWith('job_') ? jId : `job_${jId}`,
      name: "Demolition Patrol Squad",
      faction: 'yaki',
      shipClass: 'corvette',
      shipMacro: 'ship_split_m_corvette_01_a_macro',
      galaxyQuota: 6,
      sectorQuota: 2,
      taskScript: 'hunter.escort.behavior',
      rebuildOnDestroy: true
    };

    const next = [...jobs, nJob];
    saveJobs(next);
    setActiveItemIndex(jobs.length);
  };

  const handleDeleteActiveItem = () => {
    if (activeSubTab === 'wares') {
      if (wares.length <= 1) return alert("Keep at least one ware entry.");
      const next = wares.filter((_, i) => i !== activeItemIndex);
      saveWares(next);
      setActiveItemIndex(0);
    } else {
      if (jobs.length <= 1) return alert("Keep at least one job entry.");
      const next = jobs.filter((_, i) => i !== activeItemIndex);
      saveJobs(next);
      setActiveItemIndex(0);
    }
  };

  const handleUpdateActiveWareProp = (key: keyof WareDef, val: any) => {
    const next = wares.map((w, idx) => {
      if (idx === activeItemIndex) {
        return { ...w, [key]: val };
      }
      return w;
    });
    saveWares(next);
  };

  const handleUpdateActiveJobProp = (key: keyof JobDef, val: any) => {
    const next = jobs.map((j, idx) => {
      if (idx === activeItemIndex) {
        return { ...j, [key]: val };
      }
      return j;
    });
    saveJobs(next);
  };

  // Compile XML content cleanly
  const compileWaresXML = (): string => {
    const item = wares[activeItemIndex] || wares[0];
    if (!item) return '';

    if (isPatchMode) {
      return `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <!-- XML Diff Patch adding to core wares database file: libraries/wares.xml -->
  <add sel="/wares">
    <ware id="${item.id}" name="${item.name}" description="${item.description}" transport="${item.transport}" volume="${item.volume}" tags="economy equipment">
      <price min="${item.minPrice}" average="${item.avgPrice}" max="${item.maxPrice}" />
      <production time="${item.prodTime}" amount="${item.prodAmount}" method="default" name="Assembly output">
        <primary>
          <ware ware="ore" amount="15" />
          <ware ware="energycells" amount="40" />
        </primary>
      </production>
    </ware>
  </add>
</diff>`;
    } else {
      return `<?xml version="1.0" encoding="utf-8"?>
<wares>
  <!-- Pure XML wares definitions replacement list -->
  <ware id="${item.id}" name="${item.name}" description="${item.description}" transport="${item.transport}" volume="${item.volume}">
    <price min="${item.minPrice}" average="${item.avgPrice}" max="${item.maxPrice}" />
    <production time="${item.prodTime}" amount="${item.prodAmount}" method="default">
      <primary>
        <ware ware="ore" amount="15" />
        <ware ware="energycells" amount="40" />
      </primary>
    </production>
  </ware>
</wares>`;
    }
  };

  const compileJobsXML = (): string => {
    const item = jobs[activeItemIndex] || jobs[0];
    if (!item) return '';

    if (isPatchMode) {
      return `<?xml version="1.0" encoding="utf-8"?>
<diff>
  <!-- XML Diff Patch adding new AI pilot squad to core jobs database: libraries/jobs.xml -->
  <add sel="/jobs">
    <job id="${item.id}" name="${item.name}" active="true font">
      <expiration min="7200" max="14400" />
      <modifiers rebuild="${item.rebuildOnDestroy ? 'true' : 'false'}" />
      <ship>
        <select faction="${item.faction}" tags="military ${item.shipClass}" />
        <loadout>
          <level min="0.8" max="1.0" />
        </loadout>
      </ship>
      <quota galaxy="${item.galaxyQuota}" sector="${item.sectorQuota}" />
      <task script="${item.taskScript}" />
    </job>
  </add>
</diff>`;
    } else {
      return `<?xml version="1.0" encoding="utf-8"?>
<jobs>
  <!-- Pure standalone XML Job config file -->
  <job id="${item.id}" name="${item.name}" active="true">
    <expiration min="7200" max="14400" />
    <ship>
      <select faction="${item.faction}" tags="${item.shipClass}" />
    </ship>
    <quota galaxy="${item.galaxyQuota}" sector="${item.sectorQuota}" />
    <task script="${item.taskScript}" />
  </job>
</jobs>`;
    }
  };

  const activeItem = activeSubTab === 'wares' ? wares[activeItemIndex] : jobs[activeItemIndex];

  return (
    <div id="libraries_configurator_view" className="flex-1 bg-[#0a0c10] flex flex-col h-full overflow-hidden text-slate-300">
      {/* Simulation HUD Controls bar */}
      <div className="bg-[#161920]/90 border-b border-white/10 p-3 flex items-center justify-between font-mono text-xs">
        <div className="flex items-center gap-3">
          <Database className="w-4 h-4 text-cyan-400" />
          <span className="font-semibold text-slate-200 uppercase tracking-tight">X4 Game Libraries Configurator (/libraries/)</span>
        </div>
        
        {/* Toggle Mode button */}
        <div className="flex items-center gap-2">
          {/* XML Patch / Pure toggle */}
          <button
            onClick={() => setIsPatchMode(prev => !prev)}
            className={`px-3 py-1 rounded text-[10px] uppercase font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              isPatchMode
                ? 'border-cyan-500 bg-cyan-600/15 text-cyan-400'
                : 'border-white/10 bg-black/45 text-slate-400 hover:text-white'
            }`}
            title="Convert code output into a modular XML diff patch or standard XML"
          >
            <GitPullRequest className="w-3 h-3" />
            {isPatchMode ? "Mode: XML Diff (Patches)" : "Mode: Standalone XML"}
          </button>

          {/* Sub menu selector */}
          <div className="flex items-center border border-white/10 bg-black/45 p-0.5 rounded-md">
            <button
              onClick={() => { setActiveSubTab('wares'); setActiveItemIndex(0); }}
              className={`px-3 py-1 rounded text-[10px] uppercase font-bold transition-all cursor-pointer ${
                activeSubTab === 'wares' ? 'bg-cyan-500/15 text-cyan-400 font-extrabold' : 'text-slate-400 hover:text-white'
              }`}
            >
              wares.xml
            </button>
            <button
              onClick={() => { setActiveSubTab('jobs'); setActiveItemIndex(0); }}
              className={`px-3 py-1 rounded text-[10px] uppercase font-bold transition-all cursor-pointer ${
                activeSubTab === 'jobs' ? 'bg-cyan-500/15 text-cyan-400 font-extrabold' : 'text-slate-500 hover:text-white'
              }`}
            >
              jobs.xml
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Libraries assets items selector */}
        <div className="w-72 border-r border-white/10 flex flex-col bg-[#11131c]/60 overflow-hidden">
          <div className="p-3 border-b border-white/10 shrink-0 flex items-center justify-between bg-[#161a24]">
            <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider font-bold">
              {activeSubTab === 'wares' ? 'wares hierarchy' : 'npc jobs hierarchy'}
            </span>
            <button
              onClick={activeSubTab === 'wares' ? handleCreateWare : handleCreateJob}
              className="px-2 py-1 rounded hover:bg-[#202533] text-cyan-400 hover:text-white transition-all cursor-pointer flex items-center gap-1 text-[9px] font-bold tracking-wide border border-cyan-400/25 font-mono"
              title={`Create custom ${activeSubTab === 'wares' ? 'Ware asset ID' : 'Pilot quota Job group'}`}
            >
              <Plus className="w-3 h-3" /> ADD
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-3 font-mono text-[11px] scrollbar-thin">
            {activeSubTab === 'wares' ? (
              wares.length === 0 ? (
                <div className="text-[10px] text-slate-500 italic p-4 text-center">No Wares catalogued. click "ADD".</div>
              ) : (
                ['container', 'solid', 'liquid', 'energy'].map(transport => {
                  const transportWares = wares.filter(w => (w.transport || 'container') === transport);
                  if (transportWares.length === 0) return null;
                  return (
                    <div key={transport} className="space-y-1">
                      <div className="text-[9.5px] font-bold text-[#4dd0e1] uppercase flex items-center gap-1 select-none py-1 border-b border-white/[0.03]">
                        <span>📁 {transport} transport</span>
                        <span className="text-slate-500 text-[8.5px]">({transportWares.length})</span>
                      </div>
                      <div className="pl-2 border-l border-white/5 space-y-0.5">
                        {transportWares.map(item => {
                          const idx = wares.findIndex(w => w.id === item.id);
                          const itemHasWarning = warnings.filter(w => w.affectedIds.includes(item.id));
                          const hasError = itemHasWarning.some(w => w.severity === 'error');
                          const hasWarn = itemHasWarning.some(w => w.severity === 'warning');
                          const isSelected = activeItemIndex === idx;

                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                setActiveItemIndex(idx);
                              }}
                              className={`w-full text-left py-1.5 px-2 rounded font-mono transition-all flex items-center justify-between group cursor-pointer ${
                                isSelected
                                  ? hasError
                                    ? 'bg-red-950/20 text-red-400 font-bold border-l-2 border-red-500 pl-1.5'
                                    : hasWarn
                                      ? 'bg-amber-950/20 text-amber-400 font-bold border-l-2 border-amber-500 pl-1.5'
                                      : 'bg-cyan-500/10 text-cyan-400 font-bold border-l-2 border-cyan-500 pl-1.5'
                                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
                              }`}
                            >
                              <div className="truncate flex-1 pr-1">
                                <span className="truncate flex items-center gap-1">
                                  💎 {item.name}
                                </span>
                              </div>
                              <span className="text-[8.5px] text-slate-600 group-hover:text-slate-400 truncate scale-90">{item.id}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )
            ) : (
              jobs.length === 0 ? (
                <div className="text-[10px] text-slate-500 italic p-4 text-center">No Jobs catalogued. click "ADD".</div>
              ) : (
                Array.from(new Set(jobs.map(j => j.faction || 'other'))).map(faction => {
                  const factionJobs = jobs.filter(j => (j.faction || 'other') === faction);
                  return (
                    <div key={faction} className="space-y-1">
                      <div className="text-[9.5px] font-bold text-yellow-400 uppercase flex items-center gap-1 select-none py-1 border-b border-white/[0.03]">
                        <span>📁 {faction.toUpperCase()} Faction</span>
                        <span className="text-slate-500 text-[8.5px]">({factionJobs.length})</span>
                      </div>
                      <div className="pl-2 border-l border-white/5 space-y-0.5">
                        {factionJobs.map(item => {
                          const idx = jobs.findIndex(j => j.id === item.id);
                          const itemHasWarning = warnings.filter(w => w.affectedIds.includes(item.id));
                          const hasError = itemHasWarning.some(w => w.severity === 'error');
                          const hasWarn = itemHasWarning.some(w => w.severity === 'warning');
                          const isSelected = activeItemIndex === idx;

                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                setActiveItemIndex(idx);
                              }}
                              className={`w-full text-left py-1.5 px-2 rounded font-mono transition-all flex items-center justify-between group cursor-pointer ${
                                isSelected
                                  ? hasError
                                    ? 'bg-red-950/20 text-red-400 font-bold border-l-2 border-red-500 pl-1.5'
                                    : hasWarn
                                      ? 'bg-amber-950/20 text-amber-400 font-bold border-l-2 border-amber-500 pl-1.5'
                                      : 'bg-yellow-500/10 text-yellow-400 font-bold border-l-2 border-yellow-500 pl-1.5'
                                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
                              }`}
                            >
                              <div className="truncate flex-1 pr-1">
                                <span className="truncate flex items-center gap-1">
                                  ⚓ {item.name}
                                </span>
                              </div>
                              <span className="text-[8.5px] text-slate-600 group-hover:text-slate-400 truncate scale-90">{item.id}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>

          {/* Warnings / Diagnostics panel */}
          <div className="border-t border-white/10 shrink-0 bg-black/45 hover:bg-black/60 transition-colors select-none text-xs font-mono">
            <button
              onClick={() => setWarningsExpanded(!warningsExpanded)}
              className="w-full p-3 font-bold uppercase tracking-wider flex items-center justify-between cursor-pointer text-slate-300 hover:text-white"
            >
              <div className="flex items-center gap-1.5">
                <BadgeAlert className={`w-4 h-4 ${
                  warnings.filter(w => w.severity === 'error').length > 0
                    ? 'text-red-400 animate-pulse'
                    : warnings.length > 0
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                }`} />
                <span>Conflict Diagnostics</span>
                {warnings.length > 0 ? (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                    warnings.filter(w => w.severity === 'error').length > 0
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {warnings.length} issues
                  </span>
                ) : (
                  <span className="text-[9.5px] text-emerald-400 font-extrabold">Clean</span>
                )}
              </div>
              <span className="text-slate-500 text-[10px]">{warningsExpanded ? '▼' : '▲'}</span>
            </button>

            {warningsExpanded && (
              <div className="max-h-60 overflow-y-auto p-2.5 border-t border-white/5 space-y-2 bg-[#0c0d12]/90 w-full">
                <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-white/5">
                  <span className="text-[9.5px] text-slate-500">Cross-File Intersections:</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); scanProjectFilesForConflicts(); }}
                    className={`text-[9.5px] text-cyan-400 hover:text-white font-bold inline-flex items-center gap-1 cursor-pointer ${isScanning ? 'animate-spin' : ''}`}
                  >
                    🔄 Re-Scan
                  </button>
                </div>
                
                {warnings.length === 0 ? (
                  <div className="text-[10px] text-slate-500 py-3 text-center">
                    No conflicts identified in active XML definitions or mod files!
                  </div>
                ) : (
                  warnings.map(w => (
                    <div
                      key={w.id}
                      className={`p-2 rounded border text-[10px] leading-relaxed flex flex-col gap-1 ${
                        w.severity === 'error'
                          ? 'bg-red-500/5 hover:bg-red-500/10 border-red-500/20 text-red-300'
                          : 'bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/20 text-amber-300'
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between">
                        <span className="truncate pr-1">{w.title}</span>
                        <span className={`text-[8.5px] uppercase font-bold p-0.5 px-0.8 rounded ${
                          w.severity === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {w.category.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-[9.5px] text-slate-400">{w.message}</p>
                      <div className="text-[8.5px] text-slate-600 truncate mt-0.5" title={w.location}>
                        📍 Context: {w.location}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center portion: Visual controls detail editor sheet */}
        <div className="flex-1 flex flex-col border-r border-white/10 overflow-hidden">
          {!activeItem ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black/5 text-center font-mono select-none">
              <Sparkles className="w-12 h-12 text-slate-700 mb-3 stroke-[1.5]" />
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">NO ACTIVE ASSET SELECTED</h3>
              <p className="text-[10px] text-slate-500 max-w-sm mt-1 leading-relaxed font-sans">
                Select an existing library ware or cargo job item in the sidebar, or click the corresponding "+" create button to begin configuring!
              </p>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-white/10 shrink-0 flex items-center justify-between bg-black/25">
            <div>
              <h2 className="text-sm font-mono font-bold text-slate-200">
                {activeItem?.name || 'Selected Asset'}
              </h2>
              <p className="text-[10.5px] text-slate-500 font-mono mt-0.5">
                Target ID: {activeItem?.id}
              </p>
            </div>
            <button
              onClick={handleDeleteActiveItem}
              className="px-2.5 py-1 text-red-400 border border-red-500/15 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/30 rounded font-mono text-[10px] font-bold uppercase cursor-pointer transition-all flex items-center gap-1"
            >
              <Trash className="w-3.5 h-3.5" />
              Remove Item
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeItem && (() => {
              const itemHasWarning = warnings.filter(w => w.affectedIds.includes(activeItem.id));
              if (itemHasWarning.length === 0) return null;
              
              const hasError = itemHasWarning.some(w => w.severity === 'error');
              return (
                <div className={`p-3 rounded-lg border space-y-2 select-none animate-fadeIn ${
                  hasError 
                    ? 'bg-red-500/10 border-red-500/25' 
                    : 'bg-amber-500/10 border-amber-500/25'
                }`}>
                  <div className={`text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 ${
                    hasError ? 'text-red-400' : 'text-amber-400'
                  }`}>
                    <BadgeAlert className="w-4 h-4" />
                    <span>Mod Conflicts &amp; Warnings detected for this item</span>
                  </div>
                  <div className="space-y-1.5">
                    {itemHasWarning.map(w => (
                      <div key={w.id} className="text-[11px] leading-relaxed text-slate-300">
                        • <strong className="text-slate-200 font-sans">{w.title}:</strong> {w.message}
                        <div className="text-[9.5px] text-slate-500 font-mono mt-0.5 ml-2.5">Intersection Target: {w.location}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {activeSubTab === 'wares' ? (
              <div className="space-y-4 max-w-2xl">
                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Ware Display Name</label>
                    <input
                      type="text"
                      value={(activeItem as WareDef).name}
                      onChange={e => handleUpdateActiveWareProp('name', e.target.value)}
                      className="w-full p-2 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Cargo Transport Method</label>
                    <select
                      value={(activeItem as WareDef).transport}
                      onChange={e => handleUpdateActiveWareProp('transport', e.target.value)}
                      className="w-full p-2 rounded bg-[#0F1115] border border-white/10 text-white cursor-pointer focus:outline-none focus:border-cyan-500 transition-colors"
                    >
                      <option value="container">Container Cargo (Equipment/Metals/Computers)</option>
                      <option value="solid">Solid Minerals (Ore/Silicon/Ice)</option>
                      <option value="liquid">Liquid Fluids (Helium/Hydrogen/Gases)</option>
                      <option value="energy">Energy Coils (Energy Cells/Plasma)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pb-1">
                    <div>
                      <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Cargo Volume (m³)</label>
                      <input
                        type="number"
                        value={(activeItem as WareDef).volume}
                        onChange={e => handleUpdateActiveWareProp('volume', Number(e.target.value))}
                        className="w-full p-2 rounded bg-black/50 border border-white/10 text-white font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Production Assembly Cycle</label>
                      <div className="flex gap-1">
                        <input
                          type="number"
                          value={(activeItem as WareDef).prodTime}
                          onChange={e => handleUpdateActiveWareProp('prodTime', Number(e.target.value))}
                          className="w-1/2 p-2 rounded bg-black/50 border border-white/10 text-emerald-400 text-center font-bold"
                          placeholder="time"
                        />
                        <span className="self-center text-[10px] text-slate-500">sec for</span>
                        <input
                          type="number"
                          value={(activeItem as WareDef).prodAmount}
                          onChange={e => handleUpdateActiveWareProp('prodAmount', Number(e.target.value))}
                          className="w-1/3 p-2 rounded bg-black/50 border border-white/10 text-white text-center font-bold"
                          placeholder="qty"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-black/35 rounded-lg border border-white/5 space-y-3">
                    <span className="font-bold text-[9px] text-slate-400 tracking-wider block uppercase border-b border-white/5 pb-1">
                      Dynamic Profit & Pricing Matrix (Credits)
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-slate-500 block mb-1 text-[8.5px] uppercase font-bold">Min Floor</label>
                        <input
                          type="number"
                          value={(activeItem as WareDef).minPrice}
                          onChange={e => handleUpdateActiveWareProp('minPrice', Number(e.target.value))}
                          className="w-full p-1.5 rounded bg-black border border-white/10 text-red-400 text-center"
                        />
                      </div>
                      <div>
                        <label className="text-slate-500 block mb-1 text-[8.5px] uppercase font-bold text-cyan-400">Average</label>
                        <input
                          type="number"
                          value={(activeItem as WareDef).avgPrice}
                          onChange={e => handleUpdateActiveWareProp('avgPrice', Number(e.target.value))}
                          className="w-full p-1.5 rounded bg-black border border-white/10 text-cyan-400 text-center font-extrabold"
                        />
                      </div>
                      <div>
                        <label className="text-slate-500 block mb-1 text-[8.5px] uppercase font-bold">Max Ceiling</label>
                        <input
                          type="number"
                          value={(activeItem as WareDef).maxPrice}
                          onChange={e => handleUpdateActiveWareProp('maxPrice', Number(e.target.value))}
                          className="w-full p-1.5 rounded bg-black border border-white/10 text-emerald-400 text-center"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Economic Description</label>
                    <textarea
                      value={(activeItem as WareDef).description}
                      onChange={e => handleUpdateActiveWareProp('description', e.target.value)}
                      className="w-full p-2 h-16 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500 transition-colors resize-none font-sans"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-2xl">
                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Job Name Description</label>
                    <input
                      type="text"
                      value={(activeItem as JobDef).name}
                      onChange={e => handleUpdateActiveJobProp('name', e.target.value)}
                      className="w-full p-2 rounded bg-black/50 border border-white/10 text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Owning Combatant Faction</label>
                      <select
                        value={(activeItem as JobDef).faction}
                        onChange={e => handleUpdateActiveJobProp('faction', e.target.value)}
                        className="w-full p-2 rounded bg-[#0F1115] border border-white/10 text-white cursor-pointer"
                      >
                        <option value="argon">Argon Federation</option>
                        <option value="terran">Terran Protectorate</option>
                        <option value="xenon">Xenon Incursions AI</option>
                        <option value="split">Split Patriarchate</option>
                        <option value="paranid">Holy Order of Pontifex</option>
                        <option value="yaki">Yaki Raiders</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1 uppercase text-[9px] tracking-wider font-bold">Target Flight Code Behavior</label>
                      <input
                        type="text"
                        value={(activeItem as JobDef).taskScript}
                        onChange={e => handleUpdateActiveJobProp('taskScript', e.target.value)}
                        className="w-full p-2 rounded bg-black/50 border border-white/10 text-amber-500 font-bold"
                        placeholder="e.g. hunter.escort.behavior"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-black/35 rounded-lg border border-white/5 space-y-3">
                    <span className="font-bold text-[9px] text-slate-400 tracking-wider block uppercase border-b border-white/5 pb-1">
                      Spawn Active Quota Volume Matrix
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-slate-500 block mb-1 text-[8.5px] uppercase font-bold">Max Galaxy Spawns</label>
                        <input
                          type="number"
                          value={(activeItem as JobDef).galaxyQuota}
                          onChange={e => handleUpdateActiveJobProp('galaxyQuota', Number(e.target.value))}
                          className="w-full p-1.5 rounded bg-black border border-white/10 text-cyan-400 text-center font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-slate-500 block mb-1 text-[8.5px] uppercase font-bold">Max Local Sector Spawns</label>
                        <input
                          type="number"
                          value={(activeItem as JobDef).sectorQuota}
                          onChange={e => handleUpdateActiveJobProp('sectorQuota', Number(e.target.value))}
                          className="w-full p-1.5 rounded bg-black border border-white/10 text-white text-center"
                        />
                      </div>
                    </div>
                    
                    <label className="flex items-center gap-2 text-[10px] text-slate-400 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={(activeItem as JobDef).rebuildOnDestroy}
                        onChange={e => handleUpdateActiveJobProp('rebuildOnDestroy', e.target.checked)}
                        className="rounded border-white/20 bg-black text-cyan-500 focus:ring-0"
                      />
                      <span>Rebuild Vessel automatically if destroyed in battles (Maintain Quota)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
            </>
          )}
        </div>

        {/* Right side: Real-time XML / Diff Code editor view */}
        <div className="w-96 bg-[#0c0e14] border-l border-white/10 p-4 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3 shrink-0 font-mono text-xs">
            <div className="flex items-center gap-1 text-cyan-400 font-semibold uppercase">
              <Code2 className="w-4 h-4" />
              <span>/libraries/{activeSubTab === 'wares' ? 'wares.xml' : 'jobs.xml'}</span>
            </div>
            
            <button
              onClick={() => copyToClipboard(activeSubTab === 'wares' ? compileWaresXML() : compileJobsXML())}
              className="px-2 py-0.5 rounded bg-black/45 hover:bg-black/80 font-bold uppercase text-[9.5px] border border-white/10 text-slate-300 hover:text-cyan-400 cursor-pointer flex items-center gap-1"
            >
              Copy XML
            </button>
          </div>

          <div className="flex-1 bg-black/50 rounded-lg p-3 font-mono text-[10.5px] text-slate-400 overflow-y-auto relative custom-scrollbar border border-white/5 leading-normal select-text selection:bg-cyan-500/25">
            <pre className="whitespace-pre">
              {activeSubTab === 'wares' ? compileWaresXML() : compileJobsXML()}
            </pre>
          </div>

          <div className="mt-3 bg-cyan-900/10 border border-cyan-500/20 rounded p-2 text-[9.5px] leading-relaxed text-slate-400">
            <HelpCircle className="w-3.5 h-3.5 text-cyan-400 inline mr-1" />
            <span className="font-semibold text-cyan-400">XML Diff Selector Syntax:</span> In X4 Foundations, target selectors like <code className="text-cyan-400">sel="/wares"</code> inject values smoothly into existing game configurations without overwriting them.
          </div>
        </div>
      </div>
    </div>
  );

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    alert("XML configuration code copied onto clipboard!");
  }
}
