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
    const ticketMatch = line.match(/^####\s+✅\s+チケット\s+([\w.-]+):\s*(.*)/);
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

// ============================================================
// Deep source code verification helpers
// ============================================================

/**
 * src/ ディレクトリ以下の .rs ファイルを再帰的に収集する。
 */
function findRsFilesRecursively(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'target') {
      results.push(...findRsFilesRecursively(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.rs')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * spec ファイルのテスト計画からテストケース情報を抽出する。
 * Markdown テーブルをパースし、ID（# 列または ID 列）と説明を取得する。
 */
function parseTestPlan(specContent) {
  const lines = specContent.split('\n');
  const testCases = [];
  const observationTests = [];
  let inTestPlan = false;
  let inObsTest = false;
  let collectingTable = false;
  let headerRow = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      const heading = line.slice(3).trim().toLowerCase();
      inTestPlan = heading.includes('test plan') || heading.includes('テスト計画') || heading.includes('ユニットテスト');
      inObsTest = heading.includes('観測テスト') || heading.includes('observation test');
      if (!inTestPlan && !inObsTest) {
        collectingTable = false;
        headerRow = null;
      }
      continue;
    }

    // サブセクション (###) の検出
    if (line.startsWith('### ')) {
      const subheading = line.slice(3).trim().toLowerCase();
      inTestPlan = subheading.includes('test plan') || subheading.includes('テスト計画') || subheading.includes('ユニットテスト');
      inObsTest = subheading.includes('観測テスト') || subheading.includes('observation test') || subheading.includes('ots');
    }

    // テーブル行の収集
    if (line.trim().startsWith('|') && (inTestPlan || inObsTest)) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c !== '');
      if (cells.length < 2) continue;

      // 区切り行（---|---）— ヘッダとデータの区切り。headerRow は破棄せず保持する。
      if (/^-{3,}$/.test(cells[0]) || cells.every(c => /^-{3,}$/.test(c))) {
        collectingTable = true;
        continue;
      }

      if (!headerRow) {
        headerRow = cells.map(c => c.toLowerCase());
        collectingTable = true;
        continue;
      }

      if (!collectingTable) continue;

      // ID カラムを検出
      const idIdx = headerRow.findIndex(h => h === '#' || h === 'id' || h === '# id' || h.includes('id'));
      const descIdx = headerRow.findIndex(h => h.includes('テスト内容') || h.includes('内容') || h.includes('test') || h.includes('expect'));
      const desc = descIdx >= 0 && descIdx < cells.length ? cells[descIdx] : '';
      const id = idIdx >= 0 && idIdx < cells.length ? cells[idIdx] : '';

      if (id || desc) {
        const entry = {
          id: id || `test_${testCases.length + 1}`,
          description: desc,
        };

        // 観測テスト情報の抽出（サンプルサイズ等）
        const content = line.toLowerCase();
        if (content.includes('n >=') || content.includes('sample') || content.includes('サンプル')) {
          const nMatch = line.match(/n\s*(>=|>|=|:)\s*(\d[\d,]*)/);
          if (nMatch) entry.sampleSize = parseInt(nMatch[2].replace(/,/g, ''));
        }

        if (inObsTest || id.toUpperCase().startsWith('OTS')) {
          entry.type = 'observation';
          observationTests.push(entry);
        } else {
          entry.type = 'unit';
          testCases.push(entry);
        }
      }
    }
  }

  return { unitTestCases: testCases, observationTests };
}

/**
 * spec ファイルの本文から期待される型・関数・定数およびテスト計画を抽出する。
 */
function parseSpecForElements(specContent) {
  const lines = specContent.split('\n');
  const types = [];
  const functions = [];
  const calibrationConstants = [];
  let currentSection = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim().toLowerCase();
      continue;
    }

    if (currentSection === 'scope') {
      // 型: **`TypeName` トレイトの定義**
      const m = line.match(/\*\*`(\w+)`\s*トレイトの定義\*\*/);
      if (m) { types.push({ name: m[1], kind: 'trait' }); continue; }

      // 型: **`TypeName` 構造体の定義**
      const m2 = line.match(/\*\*`(\w+)`\s*構造体の定義\*\*/);
      if (m2) { types.push({ name: m2[1], kind: 'struct' }); continue; }

      // 型: **`TypeName` 列挙型の定義** (単一)
      const m3 = line.match(/\*\*`(\w+)`\s*列挙型の定義\*\*/);
      if (m3) { types.push({ name: m3[1], kind: 'enum' }); continue; }

      // 型: **`T1` / `T2` / `T3` 列挙型の定義** (複合)
      const m4 = line.match(/\*\*`(.+)`\s*列挙型の定義\*\*/);
      if (m4) {
        m4[1].split('/').forEach(n => {
          const t = n.trim().replace(/`/g, '');
          if (t) types.push({ name: t, kind: 'enum' });
        });
        continue;
      }

      // 関数: `fn function_name`
      const fnMatch = line.match(/`(fn\s+\w+)`/);
      if (fnMatch) {
        const fname = fnMatch[1].replace('fn ', '').trim();
        if (fname && !functions.includes(fname)) functions.push(fname);
      }
    }

    // 定数: 較正セクションで UPPER_CASE の識別子
    if (currentSection && currentSection.includes('較正')) {
      const constMatches = line.matchAll(/`([A-Z][A-Z_0-9]+)`/g);
      for (const cm of constMatches) {
        const cn = cm[1];
        if (!calibrationConstants.includes(cn)) calibrationConstants.push(cn);
      }
    }
  }

  const testPlan = parseTestPlan(specContent);

  return { types, functions, calibrationConstants, testPlan };
}

/**
 * spec の Test Plan に記載されたテストケースがソースコード内の #[cfg(test)] ブロックに存在するか検証する。
 */
function checkTestFunctions(darviumRoot, expectedTestIds) {
  if (!expectedTestIds || expectedTestIds.length === 0) {
    return { passed: true, entries: [] };
  }
  const srcDir = path.join(darviumRoot, 'src');
  if (!fs.existsSync(srcDir)) {
    return { passed: false, entries: expectedTestIds.map(id => ({ id, found: false, file: null, error: 'src/ not found' })) };
  }
  const srcFiles = findRsFilesRecursively(srcDir);
  const entries = [];

  for (const testId of expectedTestIds) {
    let found = false;
    let foundFile = null;
    // テスト ID から期待される関数名パターンを生成
    // T1-a → t1_a, ots1 → ots1, searchworkflow_oscillation 等
    const normalizedId = testId.toLowerCase().replace(/[-\s]/g, '_');
    const patterns = [
      new RegExp(`fn\\s+${normalizedId.replace(/_/g, '[_\\s]*')}[\\s(_]`),
      new RegExp(`fn\\s+test_${normalizedId.replace(/_/g, '[_\\s]*')}[\\s(_]`),
      new RegExp(`fn\\s+${normalizedId.split('_')[0]}[\\s(_]`),
    ];

    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const regex of patterns) {
        if (regex.test(content)) {
          found = true;
          foundFile = path.relative(srcDir, filePath);
          break;
        }
      }
      if (found) break;
    }
    entries.push({ id: testId, found, file: foundFile });
  }
  return { passed: entries.every(e => e.found), entries };
}

/**
 * 期待される型定義がソースコードに存在するか検証する。
 */
function checkSourceTypes(darviumRoot, expectedTypes) {
  if (!expectedTypes || expectedTypes.length === 0) {
    return { passed: true, entries: [] };
  }
  const srcDir = path.join(darviumRoot, 'src');
  if (!fs.existsSync(srcDir)) {
    return { passed: false, entries: expectedTypes.map(t => ({ ...t, found: false, file: null, error: 'src/ not found' })) };
  }
  const srcFiles = findRsFilesRecursively(srcDir);
  const entries = [];

  for (const t of expectedTypes) {
    let found = false;
    let foundFile = null;
    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const regex = new RegExp(`pub\\s+(?:struct|trait|enum)\\s+${t.name}\\b`);
      if (regex.test(content)) {
        found = true;
        foundFile = path.relative(srcDir, filePath);
        break;
      }
    }
    entries.push({ name: t.name, kind: t.kind, found, file: foundFile });
  }
  return { passed: entries.every(e => e.found), entries };
}

/**
 * 期待される関数がソースコードに存在するか検証する。
 */
function checkSourceFunctions(darviumRoot, expectedFunctions) {
  if (!expectedFunctions || expectedFunctions.length === 0) {
    return { passed: true, entries: [] };
  }
  const srcDir = path.join(darviumRoot, 'src');
  if (!fs.existsSync(srcDir)) {
    return { passed: false, entries: expectedFunctions.map(f => ({ name: f, found: false, file: null, error: 'src/ not found' })) };
  }
  const srcFiles = findRsFilesRecursively(srcDir);
  const entries = [];

  for (const fn of expectedFunctions) {
    let found = false;
    let foundFile = null;
    for (const filePath of srcFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const fnRegex = new RegExp(`fn\\s+${fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      if (fnRegex.test(content)) {
        found = true;
        foundFile = path.relative(srcDir, filePath);
        break;
      }
    }
    entries.push({ name: fn, found, file: foundFile });
  }
  return { passed: entries.every(e => e.found), entries };
}

/**
 * observation ファイルを読み、品質を確認する。
 */
function checkSpecObservation(darviumRoot, ticket) {
  if (!ticket.ticketId) {
    return { exists: false, lines: 0, hasContent: false, rfcRefs: [] };
  }
  const prefix = String(ticket.ticketId).padStart(4, '0');
  const specsDir = path.join(darviumRoot, 'tickets', 'specs');
  if (!fs.existsSync(specsDir)) return { exists: false, lines: 0, hasContent: false, rfcRefs: [] };
  const specFiles = fs.readdirSync(specsDir).filter(f => f.startsWith(prefix) && f.endsWith('.md'));
  if (specFiles.length === 0) return { exists: false, lines: 0, hasContent: false, rfcRefs: [] };
  const { attrs } = parseFrontmatter(fs.readFileSync(path.join(specsDir, specFiles[0]), 'utf8'));
  if (!attrs || !attrs.slug) return { exists: false, lines: 0, hasContent: false, rfcRefs: [] };

  const slug = attrs.slug;
  const contextDir = path.join(darviumRoot, 'tickets', 'context', `${prefix}-${slug}`);
  let obsPath = null;
  // observation.md を検索（observation-*.md 形式も互換性のためにサポート）
  if (fs.existsSync(contextDir)) {
    const files = fs.readdirSync(contextDir);
    const obsFile = files.find(f => f === 'observation.md' || (f.startsWith('observation-') && f.endsWith('.md')));
    if (obsFile) obsPath = path.join(contextDir, obsFile);
  }

  if (!obsPath || !fs.existsSync(obsPath)) {
    return { exists: false, lines: 0, hasContent: false, rfcRefs: [] };
  }

  const obsContent = fs.readFileSync(obsPath, 'utf8');
  const obsLines = obsContent.split('\n').filter(l => l.trim().length > 0).length;
  const hasContent = obsLines >= 3;
  const rfcRefs = [];
  const refRegex = /§([\dA-Za-z.]+)/g;
  let refMatch;
  while ((refMatch = refRegex.exec(obsContent)) !== null) {
    rfcRefs.push('§' + refMatch[1]);
  }

  return { exists: true, lines: obsLines, hasContent, rfcRefs };
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
    // RFC は ## (H2) と ### (H3) 両方の見出し階層を使用する
    const found = content.includes(`## ${sectionNum}`) || content.includes(`### ${sectionNum}`) || content.includes(s);
    return { section: s, found };
  });
  return { passed: results.every(r => r.found), checked: results };
}

function checkArtifacts(ticket, darviumRoot) {
  if (!ticket.ticketId) {
    return { plan: false, implementation: false, review: false, observation: false, observationCount: 0 };
  }
  const prefix = String(ticket.ticketId).padStart(4, '0');
  const specsDir = path.join(darviumRoot, 'tickets', 'specs');
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

  const slug = attrs.slug || 'untitled';
  const contextDir = path.join(darviumRoot, 'tickets', 'context', `${prefix}-${slug}`);

  const plan = fs.existsSync(path.join(contextDir, 'plan.md'));
  const implementation = fs.existsSync(path.join(contextDir, 'implementation.md'));
  const review = fs.existsSync(path.join(contextDir, 'review.md'));

  let observationCount = 0;
  if (fs.existsSync(contextDir)) {
    const files = fs.readdirSync(contextDir);
    observationCount = files.filter(f =>
      f === 'observation.md' || (f.startsWith('observation-') && f.endsWith('.md'))
    ).length;
  }
  const observation = observationCount > 0;

  return { plan, implementation, review, observation, observationCount };
}

function checkAcceptance(ticket, darviumRoot) {
  if (!ticket.ticketId) {
    return { passed: true, defined: 0 };
  }
  const prefix = String(ticket.ticketId).padStart(4, '0');
  const specsDir = path.join(darviumRoot, 'tickets', 'specs');
  if (!fs.existsSync(specsDir)) return { passed: true, defined: 0 };
  const specFiles = fs.readdirSync(specsDir).filter(f => f.startsWith(prefix) && f.endsWith('.md'));
  if (specFiles.length === 0) return { passed: true, defined: 0 };
  const specPath = path.join(specsDir, specFiles[0]);
  const content = fs.readFileSync(specPath, 'utf8');
  const criteriaLines = content.split('\n').filter(l => /^- \[[ x]\]/.test(l));
  return { passed: true, defined: criteriaLines.length };
}

function checkTicket(ticket, darviumRoot) {
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
        source_types: { passed: true, entries: [] },
        source_functions: { passed: true, entries: [] },
        observation_quality: { exists: false, lines: 0, hasContent: false, rfcRefs: [] },
        test_functions: { passed: true, entries: [] },
      },
    };
  }

  const artifacts = checkArtifacts(ticket, darviumRoot);
  const acceptance = checkAcceptance(ticket, darviumRoot);
  const rfcResult = checkRfcCrossRef(ticket, darviumRoot);
  const constResult = checkConstants(ticket, darviumRoot);
  const errResult = checkErrors(ticket, darviumRoot);

  // Deep source code analysis
  const prefix = String(ticket.ticketId).padStart(4, '0');
  const specsDir = path.join(darviumRoot, 'tickets', 'specs');
  const specFiles = fs.existsSync(specsDir) ? fs.readdirSync(specsDir).filter(f => f.startsWith(prefix) && f.endsWith('.md')) : [];
  let specElements = { types: [], functions: [], calibrationConstants: [], testPlan: { unitTestCases: [], observationTests: [] } };
  if (specFiles.length > 0) {
    const specContent = fs.readFileSync(path.join(specsDir, specFiles[0]), 'utf8');
    specElements = parseSpecForElements(specContent);
  }

  const sourceTypes = checkSourceTypes(darviumRoot, specElements.types);
  const sourceFunctions = checkSourceFunctions(darviumRoot, specElements.functions);
  const observationQuality = checkSpecObservation(darviumRoot, ticket);

  // Test function verification
  const allTestIds = [
    ...(specElements.testPlan?.unitTestCases || []).map(t => t.id),
    ...(specElements.testPlan?.observationTests || []).map(t => t.id),
  ];
  const testResult = checkTestFunctions(darviumRoot, allTestIds);

  const failures = [];
  const warnings = [];

  if (!artifacts.plan) failures.push('missing_plan');
  if (!artifacts.implementation) failures.push('missing_implementation');
  if (!artifacts.review) failures.push('missing_review');
  if (!rfcResult.passed) failures.push('rfc_crossref_failed');
  if (!errResult.passed) failures.push('errors_check_failed');

  // Deep source check failures
  if (!sourceTypes.passed) failures.push('source_types_mismatch');
  if (!sourceFunctions.passed) failures.push('source_functions_mismatch');
  if (!testResult.passed) failures.push('test_functions_mismatch');

  if (failures.length === 0) {
    if (!artifacts.observation) warnings.push('missing_observation');
    if (!constResult.passed) warnings.push('constants_check_failed');
    if (!observationQuality.exists) warnings.push('observation_file_missing');
    else if (!observationQuality.hasContent) warnings.push('observation_file_empty');
    if (!testResult.passed) warnings.push('test_functions_mismatch');
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
      source_types: sourceTypes,
      source_functions: sourceFunctions,
      observation_quality: observationQuality,
      test_functions: testResult,
    },
    spec_elements: {
      types: specElements.types,
      functions: specElements.functions,
      calibrationConstants: specElements.calibrationConstants,
    },
    test_plan: specElements.testPlan,
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
  const labelToIdMap = buildLabelToIdMap(darviumRoot);
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
      return checkTicket(ticket, darviumRoot);
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
  parseSpecForElements,
  parseTestPlan,
  checkSourceTypes,
  checkSourceFunctions,
  checkTestFunctions,
  checkSpecObservation,
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
