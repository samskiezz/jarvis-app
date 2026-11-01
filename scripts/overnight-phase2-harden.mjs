#!/usr/bin/env node
/**
 * overnight-phase2-harden.mjs — Codebase integrity validation for JARVIS cinematic app.
 *
 * Checks: dead imports, App.jsx mount verification, JarvisBrain wiring,
 * backlog consistency, toggle position collisions, zIndex collisions, ESLint.
 *
 * Writes report to logs/overnight-phase2-report.json.
 * Exit 0 if all pass, non-zero otherwise.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "fs";
import { resolve, dirname, basename, join, relative } from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const CINEMATIC = join(SRC, "components", "cinematic");
const APP_JSX = join(SRC, "App.jsx");
const BRAIN_JSX = join(CINEMATIC, "JarvisBrain.jsx");
const BACKLOG = join(ROOT, "docs", "JARVIS_FEATURE_BACKLOG.md");
const REPORT_PATH = join(ROOT, "logs", "overnight-phase2-report.json");

function readSafe(p) {
  try { return readFileSync(p, "utf-8"); } catch { return null; }
}

function resolveImportPath(importPath, fromFile) {
  if (importPath.startsWith("@/")) {
    const resolved = join(SRC, importPath.slice(2));
    return resolveWithExtensions(resolved);
  }
  if (importPath.startsWith(".")) {
    const resolved = resolve(dirname(fromFile), importPath);
    return resolveWithExtensions(resolved);
  }
  return null; // node_module or bare specifier — skip
}

function resolveWithExtensions(p) {
  if (existsSync(p) && statSync(p).isFile()) return p;
  for (const ext of [".jsx", ".js", ".ts", ".tsx", ".mjs"]) {
    if (existsSync(p + ext)) return p + ext;
  }
  if (existsSync(join(p, "index.jsx"))) return join(p, "index.jsx");
  if (existsSync(join(p, "index.js"))) return join(p, "index.js");
  if (existsSync(join(p, "index.ts"))) return join(p, "index.ts");
  return null;
}

function extractImports(content) {
  const results = [];
  const re = /import\s+(?:(\{[^}]*\})\s+from\s+|(\w+)\s+from\s+|(\w+)\s*,\s*(\{[^}]*\})\s+from\s+)["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const named = m[1] || m[4] || null;
    const defaultImport = m[2] || m[3] || null;
    const source = m[5];
    const symbols = [];
    if (defaultImport) symbols.push(defaultImport);
    if (named) {
      const inner = named.replace(/[{}]/g, "");
      for (const part of inner.split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const asMatch = trimmed.match(/(\w+)\s+as\s+(\w+)/);
        symbols.push(asMatch ? asMatch[2] : trimmed);
      }
    }
    results.push({ source, symbols, raw: m[0] });
  }
  return results;
}

// ── Check 1: Dead import detection ──
function checkDeadImports() {
  const issues = [];
  if (!existsSync(CINEMATIC)) return { passed: true, issues };
  const files = readdirSync(CINEMATIC).filter(f => f.endsWith(".jsx") || f.endsWith(".js"));
  for (const file of files) {
    const fullPath = join(CINEMATIC, file);
    const content = readSafe(fullPath);
    if (!content) continue;
    const imports = extractImports(content);
    for (const imp of imports) {
      if (!imp.source.startsWith(".") && !imp.source.startsWith("@/")) continue;
      const resolved = resolveImportPath(imp.source, fullPath);
      if (!resolved) {
        issues.push({ file: relative(ROOT, fullPath), import: imp.source, reason: "file not found" });
      }
    }
  }
  return { passed: issues.length === 0, issues };
}

// ── Check 2: App.jsx mount verification ──
function checkAppMounts() {
  const issues = [];
  const content = readSafe(APP_JSX);
  if (!content) return { passed: false, issues: [{ reason: "App.jsx not found" }] };
  const imports = extractImports(content);
  const cinematicImports = imports.filter(imp =>
    imp.source.includes("cinematic") || imp.source.includes("@/components/cinematic")
  );
  for (const imp of cinematicImports) {
    const resolved = resolveImportPath(imp.source, APP_JSX);
    if (!resolved) {
      issues.push({ component: imp.symbols.join(", "), source: imp.source, reason: "source file missing" });
      continue;
    }
    for (const sym of imp.symbols) {
      if (sym.startsWith("is") || sym.startsWith("build")) continue; // utility functions, not components
      if (sym[0] !== sym[0].toUpperCase()) continue; // skip non-component (lowercase) exports
      const rendered = content.includes(`<${sym}`) || content.includes(`<${sym} `) || content.includes(`<${sym}/`) || content.includes(`<${sym}>`);
      if (!rendered) {
        issues.push({ component: sym, source: imp.source, reason: "imported but not rendered in JSX" });
      }
    }
  }
  return { passed: issues.length === 0, issues };
}

// ── Check 3: JarvisBrain.jsx wiring check ──
function checkBrainWiring() {
  const issues = [];
  const content = readSafe(BRAIN_JSX);
  if (!content) return { passed: false, issues: [{ reason: "JarvisBrain.jsx not found" }] };
  const imports = extractImports(content);
  const cinematicImports = imports.filter(imp =>
    imp.source.includes("cinematic") || imp.source.includes("@/components/cinematic") || imp.source.startsWith("./") || imp.source.startsWith("../")
  );
  for (const imp of cinematicImports) {
    const resolved = resolveImportPath(imp.source, BRAIN_JSX);
    if (!resolved) {
      issues.push({ symbols: imp.symbols, source: imp.source, reason: "source file missing" });
      continue;
    }
    for (const sym of imp.symbols) {
      const usageRe = new RegExp(`\\b${sym}\\b`);
      const lines = content.split("\n");
      const importLine = lines.findIndex(l => l.includes(imp.raw) || (l.includes(sym) && l.includes("import")));
      const usedElsewhere = lines.some((l, i) => i !== importLine && usageRe.test(l));
      if (!usedElsewhere) {
        issues.push({ symbol: sym, source: imp.source, reason: "imported but never used in file body" });
      }
    }
  }
  return { passed: issues.length === 0, issues };
}

// ── Check 4: Feature backlog consistency ──
function checkBacklogConsistency() {
  const issues = [];
  const content = readSafe(BACKLOG);
  if (!content) return { passed: false, issues: [{ reason: "JARVIS_FEATURE_BACKLOG.md not found" }] };
  const lines = content.split("\n");
  // Match component .jsx files mentioned in backlog entries, excluding App.jsx, JarvisBrain.jsx etc
  const jsxFileRe = /(\w+\.jsx)\b/g;
  const excludeFiles = new Set(["App.jsx", "JarvisBrain.jsx", "CinematicShell.jsx", "CinematicHome.jsx", "JarvisLoader.jsx"]);
  for (const line of lines) {
    if (!line.includes("[x]")) continue;
    let m;
    while ((m = jsxFileRe.exec(line)) !== null) {
      const jsxFile = m[1];
      if (excludeFiles.has(jsxFile)) continue;
      const fullPath = join(CINEMATIC, jsxFile);
      if (!existsSync(fullPath)) {
        issues.push({ feature: line.slice(0, 80).trim(), file: jsxFile, reason: "file not found in cinematic/" });
      }
    }
  }
  return { passed: issues.length === 0, issues };
}

// ── Check 5 & 6: Toggle position and zIndex collision detection ──
function checkToggleCollisions() {
  const positionIssues = [];
  const zIndexIssues = [];
  if (!existsSync(CINEMATIC)) return { positions: { passed: true, issues: [] }, zIndexes: { passed: true, issues: [] } };

  const files = readdirSync(CINEMATIC).filter(f => f.endsWith(".jsx") || f.endsWith(".js"));
  const positionMap = new Map(); // left value → [files]
  const zIndexMap = new Map(); // zIndex value → [files]

  for (const file of files) {
    const fullPath = join(CINEMATIC, file);
    const content = readSafe(fullPath);
    if (!content) continue;

    // Look for toggle button patterns — these have position:fixed, bottom:18, and high left values
    // Match the specific toggle button style block pattern used across all features
    const toggleBlockRe = /position\s*:\s*['"]?fixed['"]?\s*,\s*bottom\s*:\s*\d+\s*,\s*left\s*:\s*(\d+)/g;
    let lm;
    while ((lm = toggleBlockRe.exec(content)) !== null) {
      const val = lm[1];
      if (!positionMap.has(val)) positionMap.set(val, []);
      if (!positionMap.get(val).includes(file)) positionMap.get(val).push(file);
    }

    // Fallback: match the comment header pattern "left:NNNNN bottom:18, zIndex:NNN"
    const headerRe = /left:(\d{4,})\s+bottom:\s*18/g;
    while ((lm = headerRe.exec(content)) !== null) {
      const val = lm[1];
      if (!positionMap.has(val)) positionMap.set(val, []);
      if (!positionMap.get(val).includes(file)) positionMap.get(val).push(file);
    }

    // Also match the actual JSX button line: left: NNNNN, bottom: 18
    const jsxBtnRe = /left:\s*(\d{4,}),\s*bottom:\s*18/g;
    while ((lm = jsxBtnRe.exec(content)) !== null) {
      const val = lm[1];
      if (!positionMap.has(val)) positionMap.set(val, []);
      if (!positionMap.get(val).includes(file)) positionMap.get(val).push(file);
    }

    // zIndex: extract from the BASE style object — pattern: "const BASE = {" block containing zIndex
    const baseBlockRe = /const\s+BASE\s*=\s*\{[^}]*zIndex\s*:\s*(\d+)/;
    const baseMatch = content.match(baseBlockRe);
    if (baseMatch) {
      const val = baseMatch[1];
      if (!zIndexMap.has(val)) zIndexMap.set(val, []);
      if (!zIndexMap.get(val).includes(file)) zIndexMap.get(val).push(file);
    }
  }

  for (const [val, owners] of positionMap) {
    if (owners.length > 1 && val !== "0") {
      positionIssues.push({ left: val, files: owners, reason: "toggle position collision" });
    }
  }

  for (const [val, owners] of zIndexMap) {
    if (owners.length > 1) {
      zIndexIssues.push({ zIndex: val, files: owners, reason: "zIndex collision" });
    }
  }

  return {
    positions: { passed: positionIssues.length === 0, issues: positionIssues },
    zIndexes: { passed: zIndexIssues.length === 0, issues: zIndexIssues },
  };
}

// ── Check 7: ESLint quick check ──
function checkEslint() {
  const issues = [];
  try {
    const result = execSync(
      "npx eslint src/App.jsx src/components/cinematic/JarvisBrain.jsx --quiet --no-error-on-unmatched-pattern 2>&1",
      { cwd: ROOT, encoding: "utf-8", timeout: 60000 }
    );
    if (result.trim()) {
      issues.push({ output: result.trim().slice(0, 2000) });
    }
  } catch (e) {
    const output = (e.stdout || "") + (e.stderr || "");
    if (output.trim()) {
      issues.push({ output: output.trim().slice(0, 2000) });
    }
  }
  return { passed: issues.length === 0, issues };
}

// ── Automated fixes ──
function attemptFixes(deadImports) {
  const fixes = [];
  if (!deadImports.issues.length) return fixes;

  for (const issue of deadImports.issues) {
    const fullPath = join(ROOT, issue.file);
    const content = readSafe(fullPath);
    if (!content) continue;

    const lines = content.split("\n");
    const importStr = issue.import;
    const newLines = lines.filter(line => {
      if (line.includes("import") && line.includes(importStr)) {
        fixes.push({ action: "removed_dead_import", file: issue.file, import: importStr });
        return false;
      }
      return true;
    });

    if (newLines.length !== lines.length) {
      writeFileSync(fullPath, newLines.join("\n"), "utf-8");
    }
  }
  return fixes;
}

// ── Main ──
function main() {
  console.log("Phase 2 Harden — validating codebase integrity…\n");

  const deadImports = checkDeadImports();
  console.log(`  Dead imports:        ${deadImports.passed ? "PASS" : `FAIL (${deadImports.issues.length})`}`);

  const appMounts = checkAppMounts();
  console.log(`  App.jsx mounts:      ${appMounts.passed ? "PASS" : `FAIL (${appMounts.issues.length})`}`);

  const brainWiring = checkBrainWiring();
  console.log(`  JarvisBrain wiring:  ${brainWiring.passed ? "PASS" : `FAIL (${brainWiring.issues.length})`}`);

  const backlog = checkBacklogConsistency();
  console.log(`  Backlog consistency:  ${backlog.passed ? "PASS" : `FAIL (${backlog.issues.length})`}`);

  const collisions = checkToggleCollisions();
  console.log(`  Toggle collisions:   ${collisions.positions.passed ? "PASS" : `FAIL (${collisions.positions.issues.length})`}`);
  console.log(`  zIndex collisions:   ${collisions.zIndexes.passed ? "PASS" : `FAIL (${collisions.zIndexes.issues.length})`}`);

  const eslint = checkEslint();
  console.log(`  ESLint:              ${eslint.passed ? "PASS" : `FAIL (${eslint.issues.length})`}`);

  // Attempt automated fixes for dead imports
  let fixes = [];
  if (!deadImports.passed) {
    fixes = attemptFixes(deadImports);
    if (fixes.length) {
      console.log(`\n  Applied ${fixes.length} automated fix(es). Re-checking dead imports…`);
      const recheck = checkDeadImports();
      deadImports.passed = recheck.passed;
      deadImports.issues = recheck.issues;
      console.log(`  Dead imports (post-fix): ${recheck.passed ? "PASS" : `FAIL (${recheck.issues.length})`}`);
    }
  }

  const allPassed = deadImports.passed && appMounts.passed && brainWiring.passed &&
    backlog.passed && collisions.positions.passed && collisions.zIndexes.passed && eslint.passed;

  const report = {
    passed: allPassed,
    timestamp: new Date().toISOString(),
    checks: {
      deadImports,
      appMounts,
      brainWiring,
      backlogConsistency: backlog,
      toggleCollisions: collisions.positions,
      zIndexCollisions: collisions.zIndexes,
      eslint,
    },
    fixes,
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(`\nReport: ${relative(ROOT, REPORT_PATH)}`);
  console.log(`Result: ${allPassed ? "ALL PASS" : "FAILURES DETECTED"}`);

  process.exit(allPassed ? 0 : 1);
}

main();
