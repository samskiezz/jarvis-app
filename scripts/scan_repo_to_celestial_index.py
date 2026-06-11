#!/usr/bin/env python3
"""Scan a local jarvis-app repo and generate a deterministic celestial index.

Run from repository root:
  python scripts/scan_repo_to_celestial_index.py

Outputs:
  celestial_index.generated.json
  celestial_index.generated.csv

This scanner intentionally indexes every file/record but does NOT render every item as a body.
Raw documents, notes, logs, rows and unimportant files become dust by default. Search or active workflow can promote dust to a meteorite.
"""
from __future__ import annotations
import csv, hashlib, json, math, os, re, subprocess, time
from pathlib import Path

PHI = (1 + 5 ** 0.5) / 2
GOLDEN = math.pi * (3 - 5 ** 0.5)
ROOT = Path.cwd()

PLANET_RULES = [
    ("planet:jarvis-live-ui", "JARVIS Live UI", ["server/jarvis_live.html", "src/", "world_os/ui/"], "ui", 0.96),
    ("planet:automation-runners", "Automation / Runners", ["server/dashboard.py", "server/services/"], "automation", 0.93),
    ("planet:knowledge-ontology", "Knowledge / Ontology", ["server/data/", "docs/PRODUCTION.md"], "knowledge", 0.92),
    ("planet:infrastructure", "Infrastructure", ["boot.sh", "docker", "pm2", "deploy"], "infrastructure", 0.88),
    ("planet:agent-os", "Agent OS", ["server/agent.py", "server/services/aip_tools.py", "agent"], "intelligence", 0.84),
    ("planet:inference-fabric", "Inference Fabric", ["tiered_llm", "llm_gate", "ollama", "kimi"], "intelligence", 0.82),
    ("planet:self-development", "Self-Development", ["suggestions", "proposal", "upgrade", "FEATURES.md"], "intelligence", 0.80),
    ("planet:documents-ingestion", "Documents / Ingestion", ["scrape", "ingest", "ocr", "documents"], "knowledge", 0.74),
    ("planet:correlation-graph", "Correlation / Graph", ["correlator", "graph_stream", "GraphCanvas", "PlaneGraph", "layoutEngine"], "knowledge", 0.72),
    ("planet:glb-media-studio", "GLB / Media Studio", ["media", "glb", "model", "library", "underworld/web/public/models"], "media", 0.70),
    ("planet:guardian", "Guardian", ["guardian", "mum", "webrtc"], "guardian", 0.68),
    ("planet:climate", "Climate", ["climate", "AirTouch", "Daikin"], "guardian", 0.60),
    ("planet:voice-tts", "Voice / TTS", ["tts", "voice", "piper", "xtts"], "voice", 0.58),
    ("planet:budget-token-governor", "Budget / Token Governor", ["budget", "token_governor"], "budget", 0.56),
    ("planet:underworld", "Underworld", ["underworld/"], "underworld", 0.50),
]

MOON_RULES = {
    "planet:jarvis-live-ui": ["Three.js Universe", "Apex Core", "Camera System", "Search / Fly-To", "HUD / Dock"],
    "planet:automation-runners": ["Knowledge Builder", "Cross-Correlator", "Document Ingestor", "Live Data Producer", "Self-Learning Loop", "Heavy Worker"],
    "planet:knowledge-ontology": ["Topics", "Measurements", "Ontology Objects", "Knowledge Graph", "Recent Learning"],
    "planet:infrastructure": ["VPS Server", "Vast GPU Box", "PM2 Processes", "Storage", "Network"],
    "planet:agent-os": ["Tool Registry", "Planner / Executor", "Approvals"],
    "planet:inference-fabric": ["LLM Router", "Tiered Models", "GPU Fallback"],
    "planet:self-development": ["Suggestions", "Proposals", "Upgrade Builder", "Rollback / Scheduler"],
    "planet:documents-ingestion": ["Document Vault", "OCR / Scrape Ingest", "Source Chunks"],
    "planet:correlation-graph": ["Graph Stream", "Layout Engine", "Entity Dedupe"],
    "planet:glb-media-studio": ["GLB Library", "Model Loader", "Image Studio"],
    "planet:guardian": ["Guardian Monitor", "Life-Safety Rules"],
    "planet:climate": ["Climate Zones", "Climate Intent"],
    "planet:voice-tts": ["TTS Engine", "Voice Modulator"],
    "planet:budget-token-governor": ["Budget State", "Economy Mode"],
    "planet:underworld": ["Underworld Web", "Underworld Backend", "Scene Components"],
}

DUST_EXT = {'.md', '.txt', '.json', '.csv', '.log', '.pdf', '.sqlite', '.db'}
CODE_EXT = {'.py', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.html', '.css'}
ACTION_WORDS = ['open', 'run', 'pause', 'stop', 'restart', 'build', 'inspect', 'summarise', 'summarize', 'view logs']

def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
def clamp01(v): return max(0, min(1, float(v)))
def log_norm(v, mx): return clamp01(math.log10(1+v)/math.log10(1+max(1,mx)))
def hash_phase(s): return (int(hashlib.sha256(s.encode()).hexdigest()[:8],16)/0xffffffff)*math.tau

def classify_planet(path: str):
    score = []
    low = path.lower()
    for pid, label, pats, lane, pri in PLANET_RULES:
        s = sum(1 for p in pats if p.lower() in low)
        if s: score.append((s, pid, label, lane, pri))
    if score:
        return sorted(score, reverse=True)[0][1:]
    return ('planet:jarvis-live-ui', 'JARVIS Live UI', 'ui', 0.45)

def file_kind(path: Path):
    ext = path.suffix.lower()
    name = str(path).lower()
    if ext in DUST_EXT:
        return 'dust'
    if ext in CODE_EXT:
        if any(w in name for w in ['service', 'agent', 'relay', 'daemon', 'gate', 'router', 'stream', 'engine']):
            return 'moon-candidate'
        return 'dust'
    if ext in {'.glb', '.png', '.jpg', '.jpeg', '.webp'}:
        return 'dust'
    return 'dust'

def main():
    files = []
    for p in ROOT.rglob('*'):
        if not p.is_file(): continue
        rel = p.relative_to(ROOT).as_posix()
        if any(part in rel for part in ['.git/', 'node_modules/', '.venv/', '__pycache__/', 'dist/', 'build/']): continue
        files.append(rel)
    max_usage = max(1, max((Path(f).stat().st_size if Path(f).exists() else 1) for f in files[:1000]) if files else 1)
    nodes = []
    nodes.append({'id':'apex:jarvis-core','kind':'apex','parent':'','label':'JARVIS Apex Core','repo':'WORLD_MANIFEST.sun + buildBrain','importance':1,'visibility':'home'})
    # Planets and moons
    planet_ids = set()
    for pid,label,lane,pri in [(p[0],p[1],p[3],p[4]) for p in PLANET_RULES]:
        planet_ids.add(pid)
        nodes.append({'id':pid,'kind':'planet','parent':'apex:jarvis-core','label':label,'repo':'rule-matched repo domain','lane':lane,'importance':pri,'visibility':'home/top-important'})
        for idx, moon in enumerate(MOON_RULES.get(pid, [])):
            nodes.append({'id':'moon:'+slug(moon),'kind':'moon','parent':pid,'label':moon,'repo':'derived major area','lane':'local','importance':max(0.5,pri-idx*0.025),'visibility':'planetFocus'})
    # Raw files as dust or moon candidates
    for f in files:
        pid, plabel, lane, ppri = classify_planet(f)
        fk = file_kind(Path(f))
        if fk == 'moon-candidate':
            label = Path(f).stem.replace('_',' ').replace('-',' ').title()
            nodes.append({'id':'moon:file:'+slug(f),'kind':'moon','parent':pid,'label':label,'repo':f,'lane':'local','importance':0.55,'visibility':'planetFocus/search'})
        else:
            parent = 'moon:document-vault' if 'document' in f.lower() or Path(f).suffix.lower() in DUST_EXT else 'moon:three-js-universe'
            nodes.append({'id':'dust:file:'+hashlib.sha1(f.encode()).hexdigest()[:12],'kind':'dust','parent':parent,'label':Path(f).name,'repo':f,'lane':'cloud','importance':0.12,'visibility':'search-promoted-only'})
    # Write outputs into server/data/ so the dashboard can serve them
    out_dir = ROOT / 'server' / 'data' if (ROOT / 'server' / 'data').is_dir() else ROOT
    with open(out_dir / 'celestial_index.generated.json','w',encoding='utf-8') as fh:
        json.dump({'generated_at':time.time(),'nodes':nodes},fh,indent=2)
    headers = sorted({k for n in nodes for k in n})
    with open(out_dir / 'celestial_index.generated.csv','w',newline='',encoding='utf-8') as fh:
        w=csv.DictWriter(fh,fieldnames=headers); w.writeheader(); w.writerows(nodes)
    print(f'generated {len(nodes)} celestial index nodes from {len(files)} repo files')

if __name__ == '__main__':
    main()
