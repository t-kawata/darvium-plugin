#!/usr/bin/env node
/**
 * /check-all コマンド用一括チェックスクリプト
 *
 * Darvium-Tickets-v2.3.md の全 ✅ チケットを横断的に検証する。
 * 読み取り専用。ステータス変更は行わない。
 *
 * 使用方法: node run-check-all.js [darvium_root]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { parseFrontmatter } = require('../../lib/tickets');

// ============================================================
// Configuration
// ============================================================

const EXPECTED_CONSTANTS = {
  1: [],
  2: [],
  3: ['FAKE_LLM_DEFAULT_MALFORMED_PROB'],
  4: ['FAKE_EMBEDDING_DEFAULT_DIMENSION'],
  5: ['CLOCK_DEFAULT_START_MS'],
  6: ['DEFAULT_MAX_ITERATIONS', 'DEFAULT_MAX_RETRIEVAL_CALLS', 'DEFAULT_MAX_WALL_CLOCK_MS', 'DEFAULT_RECURSION_MAX_DEPTH'],
  7: [],
  8: [],
  9: [],
  10: ['OSCILLATION_MAX_COUNT'],
  11: ['EVALUATION_THRESHOLD', 'SELF_CONF_DISCOUNT'],
};

const EXPECTED_ERRORS = {
  1: ['SearchValidation'],
  2: ['Storage', 'NotFound'],
  3: ['Llm', 'LlmMalformedJson'],
  4: ['Embedding', 'EmbeddingDimensionMismatch'],
  5: [],
  6: ['SearchBudgetExceeded', 'SearchRecursionExceeded'],
  7: ['Retrieval', 'RetrievalTimeout'],
  8: ['SearchValidation'],
  9: ['TerminalStateViolation'],
  10: ['SearchPolicyOscillation'],
  11: ['InvalidScore'],
};

const TRANSLATABILITY_PATTERNS = [
  { name: 'unwrap_calls', pattern: /\.unwrap\(\)/g, severity: 'major' },
  { name: 'magic_numbers', pattern: /\b\d{4,}\b/g, severity: 'warning' },
  { name: 'single_letter_vars', pattern: /\b(mut|let)\s+([a-hj-z])\b(?!\s*=)/g, severity: 'minor' },
  { name: 'todo_comments', pattern: /\/\/\s*(TODO|FIXME|HACK|XXX)/g, severity: 'warning' },
];

const SOURCE_FILES_FOR_TRANSLATABILITY = [
  'src/types.rs', 'src/lib.rs', 'src/constants.rs', 'src/error.rs',
];

// ============================================================
// Cache (module-level, read-once)
// ============================================================

const _cache = {
  _constants: {},  // darviumRoot → content
  _errors: {},     // darviumRoot → content
};

function getConstantsContent(darviumRoot) {
  if (!_cache._constants[darviumRoot]) {
    const p = path.join(darviumRoot, 'src', 'constants.rs');
    _cache._constants[darviumRoot] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  }
  return _cache._constants[darviumRoot];
}

function getErrorsContent(darviumRoot) {
  if (!_cache._errors[darviumRoot]) {
    const p = path.join(darviumRoot, 'src', 'error.rs');
    _cache._errors[darviumRoot] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  }
  return _cache._errors[darviumRoot];
}

/** テスト用: キャッシュをクリアする */
function _resetCache() {
  _cache._constants = {};
  _cache._errors = {};
}

// ============================================================
// Helpers
// ============================================================

function resolveDarviumRoot() {
  if (process.env.DARVIUM_ROOT) {
    return path.resolve(process.env.DARVIUM_ROOT);
  }
  if (process.argv[2]) {
    return path.resolve(process.argv[2]);
  }
  const devCtxPath = path.resolve(__dirname, '../../../contexts/dev.md');
  if (fs.existsSync(devCtxPath)) {
    const content = fs.readFileSync(devCtxPath, 'utf8');
    const match = content.match(/DARVIUM_ROOT\s*=\s*(.+)/);
    if (match) {
      let root = match[1].trim().replace(/^~/, process.env.HOME || '');
      return path.resolve(root);
    }
  }
  return null;
}

function getPluginRoot() {
  return path.resolve(__dirname, '../../..');
}

/**
 * spec ファイルの frontmatter title から M-label を抽出し、
 * { label → ticket_id } マップを構築する。
 */
function buildLabelToIdMap(pluginRoot) {
  const map = {};
  const specsDir = path.join(pluginRoot, 'tickets', 'specs');
  if (!fs.existsSync(specsDir)) return map;
  const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.md')).sort();
  for (const file of files) {
    const filePath = path.join(specsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const { attrs } = parseFrontmatter(content);
    if (!attrs || !attrs.ticket_id || !attrs.title) continue;
    const m = attrs.title.match(/^M-[\d.]+(?:-[\d.]+)?/);
    if (m) {
      map[m[0]] = attrs.ticket_id;
    }
  }
  return map;
}

// ============================================================
// Phase 1: Parse Darvium-Tickets document
// ============================================================

/**
 * Darvium-Tickets-v2.3.md から ✅ 完了チケットの一覧を抽出する。
 */
function parseTicketsDoc(darviumRoot, labelToIdMap) {
  const ticketsDocPath = path.join(darviumRoot, 'Darvium-Tickets-v2.3.md');
  if (!fs.existsSync(ticketsDocPath)) {
    return null;
  }
  const content = fs.readFileSync(ticketsDocPath, 'utf8');
  const lines = content.split('\n');
  const completed = [];
  let current = null;

  for (const line of lines) {
    const ticketMatch = line.match(/^####\s+.*チケット\s+([\w.-]+):\s*(.*)/);
    if (ticketMatch) {
      if (current) completed.push(current);
      current = {
        label: ticketMatch[1],
        title: ticketMatch[2].trim(),
        rfcSections: [],
        scope: '',
        ticketId: labelToIdMap[ticketMatch[1]] || null,
      };
      continue;
    }

    if (current && /^#### (?!.*チケット)/.test(line)) {
      completed.push(current);
      current = null;
      continue;
    }

    if (current) {
      const rfcMatch = line.match(/^\*\s+\*\*対象不変条件\s*\/\s*規範:\*\*[\s　]*(.*)/);
      if (rfcMatch) {
        const raw = rfcMatch[1];
        const sections = [];
        const sectionRegex = /§([\dA-Za-z.]+)/g;
        let s;
        while ((s = sectionRegex.exec(raw)) !== null) {
          sections.push('§' + s[1]);
        }
        current.rfcSections = sections;
        continue;
      }
      const scopeMatch = line.match(/^\*\s+\*\*実装スコープ:\*\*[\s　]*(.*)/);
      if (scopeMatch) {
        current.scope = scopeMatch[1];
        continue;
      }
    }
  }
  if (current) completed.push(current);

  return { completed };
}

// ============================================================
// Phase 2: Individual ticket checks
// ============================================================

function checkConstants(ticket, darviumRoot) {
  const constList = EXPECTED_CONSTANTS[ticket.ticketId];
  if (!constList || constList.length === 0) {
    return { passed: true, checked: [] };
  }
  const content = getConstantsContent(darviumRoot);
  const results = constList.map(name => ({
    name,
    found: content.includes(`pub const ${name}`),
  }));
  return { passed: results.every(r => r.found), checked: results };
}

function checkErrors(ticket, darviumRoot) {
  const errList = EXPECTED_ERRORS[ticket.ticketId];
  if (!errList || errList.length === 0) {
    return { passed: true, checked: [] };
  }
  const content = getErrorsContent(darviumRoot);
  const results = errList.map(name => ({
    name,
    found: content.includes(name),
  }));
  return { passed: results.every(r => r.found), checked: results };
}

function checkRfcCrossRef(ticket, darviumRoot) {
  if (!ticket.rfcSections || ticket.rfcSections.length === 0) {
    return { passed: true, checked: [] };
  }
  const rfcPath = path.join(darviumRoot, 'Darvium-RFC-0001-Unified-v2.3-final.md');
  if (!fs.existsSync(rfcPath)) {
    return { passed: false, checked: ticket.rfcSections.map(s => ({ section: s, found: false, error: 'RFC file not found' })) };
  }
  const content = fs.readFileSync(rfcPath, 'utf8');
  const results = ticket.rfcSections.map(s => {
    const sectionNum = s.replace(/^§/, '');
    const found = content.includes(`## ${sectionNum}`) || content.includes(s);
    return { section: s, found };
  });
  return { passed: results.every(r => r.found), checked: results };
}

function checkArtifacts(ticket, pluginRoot) {
  if (!ticket.ticketId) {
    return { plan: false, implementation: false, review: false, observation: false, observationCount: 0 };
  }
  const prefix = String(ticket.ticketId).padStart(4, '0');
  const specsDir = path.join(pluginRoot, 'tickets', 'specs');
  if (!fs.existsSync(specsDir)) {
    return { plan: false, implementation: false, review: false, observation: false, observationCount: 0 };
  }
  const specFiles = fs.readdirSync(specsDir).filter(f => f.startsWith(prefix) && f.endsWith('.md'));
  if (specFiles.length === 0) {
    return { plan: false, implementation: false, review: false, observation: false, observationCount: 0 };
  }
  const specPath = path.join(specsDir, specFiles[0]);
  const { attrs } = parseFrontmatter(fs.readFileSync(specPath, 'utf8'));
  if (!attrs) {
    return { plan: false, implementation: false, review: false, observation: false, observationCount: 0 };
  }

  const planPath = attrs.plan_path ? path.resolve(pluginRoot, attrs.plan_path) : null;
  const implPath = attrs.implementation_path ? path.resolve(pluginRoot, attrs.implementation_path) : null;
  const reviewPath = attrs.review_report_path ? path.resolve(pluginRoot, attrs.review_report_path) : null;

  const plan = planPath ? fs.existsSync(planPath) : false;
  const implementation = implPath ? fs.existsSync(implPath) : false;
  const review = reviewPath ? fs.existsSync(reviewPath) : false;

  const slug = attrs.slug || 'untitled';
  const contextDir = path.join(pluginRoot, 'tickets', 'context', `${prefix}-${slug}`);
  let observationCount = 0;
  if (fs.existsSync(contextDir)) {
    const files = fs.readdirSync(contextDir);
    observationCount = files.filter(f => f.startsWith('observation-') && f.endsWith('.md')).length;
  }
  const observation = observationCount > 0;

  return { plan, implementation, review, observation, observationCount };
}

function checkAcceptance(ticket, pluginRoot) {
  if (!ticket.ticketId) {
    return { passed: true, defined: 0 };
  }
  const prefix = String(ticket.ticketId).padStart(4, '0');
  const specsDir = path.join(pluginRoot, 'tickets', 'specs');
  if (!fs.existsSync(specsDir)) return { passed: true, defined: 0 };
  const specFiles = fs.readdirSync(specsDir).filter(f => f.startsWith(prefix) && f.endsWith('.md'));
  if (specFiles.length === 0) return { passed: true, defined: 0 };
  const specPath = path.join(specsDir, specFiles[0]);
  const content = fs.readFileSync(specPath, 'utf8');
  const criteriaLines = content.split('\n').filter(l => /^- \[[ x]\]/.test(l));
  return { passed: true, defined: criteriaLines.length };
}

function checkTicket(ticket, darviumRoot, pluginRoot) {
  if (!ticket.ticketId) {
    return {
      label: ticket.label,
      ticketId: null,
      title: ticket.title,
      status: 'unknown',
      verdict: 'ERROR',
      failures: ['unresolved_ticket'],
      warnings: [],
      checks: {
        artifacts: { plan: false, implementation: false, review: false, observation: false, observationCount: 0 },
        acceptance: { passed: true, defined: 0 },
        rfc_crossref: { passed: true, checked: [] },
        constants: { passed: true, checked: [] },
        errors: { passed: true, checked: [] },
      },
    };
  }

  const artifacts = checkArtifacts(ticket, pluginRoot);
  const acceptance = checkAcceptance(ticket, pluginRoot);
  const rfcResult = checkRfcCrossRef(ticket, darviumRoot);
  const constResult = checkConstants(ticket, darviumRoot);
  const errResult = checkErrors(ticket, darviumRoot);

  const failures = [];
  const warnings = [];

  if (!artifacts.plan) failures.push('missing_plan');
  if (!artifacts.implementation) failures.push('missing_implementation');
  if (!artifacts.review) failures.push('missing_review');
  if (!rfcResult.passed) failures.push('rfc_crossref_failed');
  if (!errResult.passed) failures.push('errors_check_failed');

  if (failures.length === 0) {
    if (!artifacts.observation) warnings.push('missing_observation');
    if (!constResult.passed) warnings.push('constants_check_failed');
  }

  let verdict;
  if (failures.length > 0) verdict = 'FAIL';
  else if (warnings.length > 0) verdict = 'WARN';
  else verdict = 'PASS';

  return {
    label: ticket.label,
    ticketId: ticket.ticketId,
    title: ticket.title,
    status: 'done',
    verdict,
    failures,
    warnings,
    checks: {
      artifacts,
      acceptance,
      rfc_crossref: rfcResult,
      constants: constResult,
      errors: errResult,
    },
  };
}

// ============================================================
// Phase 3: Global checks
// ============================================================

function runCommand(cmd, opts = {}) {
  try {
    const output = execSync(cmd, {
      cwd: opts.cwd || process.cwd(),
      timeout: opts.timeout || 120000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { passed: true, exitCode: 0, output };
  } catch (e) {
    const stderr = e.stderr || '';
    const stdout = e.stdout || '';
    return {
      passed: false,
      exitCode: e.status || -1,
      output: stdout + stderr,
      error: e.message,
    };
  }
}

function runGlobalChecks(darviumRoot, pluginRoot) {
  const cargoTest = runCommand('cargo test 2>&1', { cwd: darviumRoot, timeout: 180000 });
  const cargoClippy = runCommand('cargo clippy -- -D warnings 2>&1', { cwd: darviumRoot, timeout: 120000 });
  const cargoFmt = runCommand('cargo fmt --check 2>&1', { cwd: darviumRoot, timeout: 60000 });

  let validateStructure = { passed: false, issues: 0 };
  const validateScript = path.join(pluginRoot, 'scripts', 'tickets', 'validate-structure.js');
  if (fs.existsSync(validateScript)) {
    const result = runCommand(`node "${validateScript}"`, { cwd: pluginRoot, timeout: 30000 });
    if (result.passed && result.output) {
      try {
        const parsed = JSON.parse(result.output);
        validateStructure = { passed: parsed.valid === true, issues: parsed.issuesCount || 0 };
      } catch (_) {
        validateStructure = { passed: false, issues: -1 };
      }
    } else {
      validateStructure = { passed: false, issues: -1 };
    }
  }

  return {
    cargo_test: {
      passed: cargoTest.passed && !cargoTest.output.includes('FAILED'),
      exitCode: cargoTest.exitCode,
      testRuns: (cargoTest.output.match(/test result:/g) || []).length,
      summary: cargoTest.output.split('\n').filter(l => l.includes('test result:')).join('; ') || '',
    },
    cargo_clippy: { passed: cargoClippy.passed, exitCode: cargoClippy.exitCode },
    cargo_fmt: { passed: cargoFmt.passed, exitCode: cargoFmt.exitCode },
    validate_structure: validateStructure,
  };
}

// ============================================================
// Phase 4: Translatability check
// ============================================================

function checkTranslatability(darviumRoot) {
  const issues = [];
  let totalChecked = 0;

  for (const relPath of SOURCE_FILES_FOR_TRANSLATABILITY) {
    const filePath = path.join(darviumRoot, relPath);
    if (!fs.existsSync(filePath)) continue;
    totalChecked++;

    for (const pattern of TRANSLATABILITY_PATTERNS) {
      const content = fs.readFileSync(filePath, 'utf8');
      pattern.pattern.lastIndex = 0;
      const matches = content.match(pattern.pattern);
      if (!matches) continue;

      const seenMatches = new Set();
      let searchFrom = 0;
      for (const m of matches) {
        if (seenMatches.has(m)) continue;
        seenMatches.add(m);
        const idx = content.indexOf(m, searchFrom);
        if (idx === -1) continue;
        searchFrom = idx + 1;
        const lineNum = content.substring(0, idx).split('\n').length;
        issues.push({
          file: relPath,
          line: lineNum,
          type: pattern.name,
          severity: pattern.severity,
          match: m.length > 80 ? m.substring(0, 77) + '...' : m,
        });
      }
    }
  }

  const bySeverity = { major: 0, warning: 0, minor: 0 };
  for (const issue of issues) {
    if (bySeverity[issue.severity] !== undefined) bySeverity[issue.severity]++;
  }

  return {
    passed: bySeverity.major === 0,
    total: issues.length,
    bySeverity,
    issues,
  };
}

// ============================================================
// Assembler
// ============================================================

function assembleReport(ticketsResults, globalChecks, translatability, darviumRoot, durationMs) {
  const summary = { total: 0, passed: 0, warnings: 0, failed: 0, errors: 0 };

  for (const t of ticketsResults) {
    summary.total++;
    if (t.verdict === 'PASS') summary.passed++;
    else if (t.verdict === 'WARN') summary.warnings++;
    else if (t.verdict === 'FAIL') summary.failed++;
    else if (t.verdict === 'ERROR') summary.errors++;
  }

  return {
    timestamp: new Date().toISOString(),
    darviumRoot,
    durationMs,
    summary,
    tickets: ticketsResults,
    global_checks: globalChecks,
    translatability,
  };
}

// ============================================================
// Main
// ============================================================

function main() {
  const start = Date.now();

  const darviumRoot = resolveDarviumRoot();
  if (!darviumRoot) {
    const report = {
      timestamp: new Date().toISOString(),
      darviumRoot: null,
      durationMs: 0,
      summary: { total: 0, passed: 0, warnings: 0, failed: 0, errors: 0 },
      tickets: [],
      global_checks: null,
      translatability: null,
      fatal_error: 'DARVIUM_ROOT could not be resolved. Set the DARVIUM_ROOT environment variable or pass it as an argument.',
    };
    console.log(JSON.stringify(report, null, 2));
    console.error('CHECK-ALL-SUMMARY: passed=0 warnings=0 failed=0 errors=0 duration=0ms');
    process.exit(1);
  }

  const pluginRoot = getPluginRoot();
  const labelToIdMap = buildLabelToIdMap(pluginRoot);
  const ticketsDoc = parseTicketsDoc(darviumRoot, labelToIdMap);

  if (!ticketsDoc) {
    const report = {
      timestamp: new Date().toISOString(),
      darviumRoot,
      durationMs: Date.now() - start,
      summary: { total: 0, passed: 0, warnings: 0, failed: 0, errors: 0 },
      tickets: [],
      global_checks: null,
      translatability: null,
      fatal_error: `Darvium-Tickets-v2.3.md not found at ${darviumRoot}`,
    };
    console.log(JSON.stringify(report, null, 2));
    console.error(`CHECK-ALL-SUMMARY: passed=0 warnings=0 failed=0 errors=0 duration=${Date.now() - start}ms`);
    process.exit(1);
  }

  const ticketsResults = ticketsDoc.completed.map(ticket => {
    try {
      return checkTicket(ticket, darviumRoot, pluginRoot);
    } catch (e) {
      return {
        label: ticket.label,
        ticketId: ticket.ticketId,
        title: ticket.title,
        status: 'done',
        verdict: 'ERROR',
        failures: ['check_exception'],
        warnings: [],
        checks: {},
        _error: e.message,
      };
    }
  });

  const globalChecks = runGlobalChecks(darviumRoot, pluginRoot);
  const translatability = checkTranslatability(darviumRoot);
  const durationMs = Date.now() - start;
  const report = assembleReport(ticketsResults, globalChecks, translatability, darviumRoot, durationMs);

  console.log(JSON.stringify(report, null, 2));

  const s = report.summary;
  console.error(`CHECK-ALL-SUMMARY: passed=${s.passed} warnings=${s.warnings} failed=${s.failed} errors=${s.errors} duration=${durationMs}ms`);
}

if (require.main === module) main();

module.exports = {
  resolveDarviumRoot,
  buildLabelToIdMap,
  parseTicketsDoc,
  checkConstants,
  checkErrors,
  checkRfcCrossRef,
  checkArtifacts,
  checkAcceptance,
  checkTicket,
  runGlobalChecks,
  checkTranslatability,
  assembleReport,
  main,
  _resetCache,
  EXPECTED_CONSTANTS,
  EXPECTED_ERRORS,
  TRANSLATABILITY_PATTERNS,
};
