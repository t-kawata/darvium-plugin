/**
 * /check-all 用 run-check-all.js のテスト
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  resolveDarviumRoot,
  buildLabelToIdMap,
  parseTicketsDoc,
  checkConstants,
  checkErrors,
  checkRfcCrossRef,
  checkArtifacts,
  checkAcceptance,
  checkTicket,
  assembleReport,
  _resetCache,
} = require('../../scripts/tickets/check-all/run-check-all');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; process.stdout.write(`  ✓ ${message}\n`); }
  else { failed++; process.stdout.write(`  ✗ ${message}\n`); }
}

function assertEq(actual, expected, message) {
  const ok = actual === expected;
  if (ok) { passed++; process.stdout.write(`  ✓ ${message}\n`); }
  else { failed++; process.stdout.write(`  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}\n`); }
}

function assertDeepEq(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; process.stdout.write(`  ✓ ${message}\n`); }
  else { failed++; process.stdout.write(`  ✗ ${message}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}\n`); }
}

function withTempDir(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-all-test-'));
  try { fn(tmpDir); }
  finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
}

console.log('\n━━━ check-all.test.js ━━━\n');

// --- resolveDarviumRoot ---
console.log('## resolveDarviumRoot\n');
{
  const prev = process.env.DARVIUM_ROOT;
  const oldArgv = process.argv[2];

  // Default: reads from contexts/dev.md in this project (should succeed)
  delete process.env.DARVIUM_ROOT;
  process.argv[2] = undefined;
  const defaultRoot = resolveDarviumRoot();
  assert(defaultRoot !== null, 'resolves darvium root from contexts/dev.md');

  // Env override
  process.env.DARVIUM_ROOT = '/tmp/fake-darvium-env';
  assertEq(resolveDarviumRoot(), '/tmp/fake-darvium-env', 'reads from DARVIUM_ROOT env');

  // Argv as fallback (when env is not set)
  delete process.env.DARVIUM_ROOT;
  process.argv[2] = '/tmp/fake-darvium-argv';
  assertEq(resolveDarviumRoot(), '/tmp/fake-darvium-argv', 'reads from argv when env not set');

  // Restore
  process.argv[2] = oldArgv;
  if (prev) process.env.DARVIUM_ROOT = prev;
  else delete process.env.DARVIUM_ROOT;
}

// --- buildLabelToIdMap ---
console.log('\n## buildLabelToIdMap\n');
withTempDir(tmpDir => {
  const specsDir = path.join(tmpDir, 'tickets', 'specs');
  fs.mkdirSync(specsDir, { recursive: true });

  const map = buildLabelToIdMap(tmpDir);
  assertEq(Object.keys(map).length, 0, 'empty specs dir returns empty map');

  // NOTE: no quotes around title; parseFrontmatter doesn't strip YAML quotes
  fs.writeFileSync(path.join(specsDir, '0001-test.md'),
    '---\nticket_id: 1\ntitle: M-2-1: RetrievalPrimitive\nslug: test\nstatus: done\n---\n');
  fs.writeFileSync(path.join(specsDir, '0002-test.md'),
    '---\nticket_id: 2\ntitle: M-2-1.5: Dual-Store\nslug: test2\nstatus: done\n---\n');
  fs.writeFileSync(path.join(specsDir, '0003-test.md'),
    '---\nticket_id: 3\ntitle: M-1.5-3: SearchPolicyOscillation\nslug: test3\nstatus: done\n---\n');

  const map2 = buildLabelToIdMap(tmpDir);
  assertEq(map2['M-2-1'], 1, 'maps M-2-1 → ticket_id 1');
  assertEq(map2['M-2-1.5'], 2, 'maps M-2-1.5 → ticket_id 2');
  assertEq(map2['M-1.5-3'], 3, 'maps M-1.5-3 → ticket_id 3');
  assertEq(Object.keys(map2).length, 3, 'all 3 spec files mapped');
});

// --- parseTicketsDoc ---
console.log('\n## parseTicketsDoc\n');
{
  const sampleDoc = `# Darvium Tickets

#### ✅ チケット M-2-1: RetrievalPrimitive

* **対象不変条件 / 規範:** §13.4 RetrievalPrimitive 契約
* **実装スコープ:** トレイト定義

#### ✅ チケット M-2-1.5: Dual-Store

* **対象不変条件 / 規範:** §12.2 Dual Retrieval、§25 DB 構成
* **実装スコープ:** GraphStore/MetadataStore

#### Some other heading

#### ✅ チケット M-2-2: SearchBudget

* **対象不変条件 / 規範:** §13.6 ガード条件
* **実装スコープ:** 構造体定義`;

  withTempDir(tmpDir => {
    const docPath = path.join(tmpDir, 'Darvium-Tickets-v2.3.md');
    fs.writeFileSync(docPath, sampleDoc, 'utf8');

    const labelMap = { 'M-2-1': 1, 'M-2-1.5': 2, 'M-2-2': null };
    const result = parseTicketsDoc(tmpDir, labelMap);

    assert(result !== null, 'parses document successfully');
    assertEq(result.completed.length, 3, 'finds 3 completed tickets');

    const t1 = result.completed[0];
    assertEq(t1.label, 'M-2-1', 'first ticket label is M-2-1');
    assertEq(t1.title, 'RetrievalPrimitive', 'correct title');
    assertDeepEq(t1.rfcSections, ['§13.4'], 'extracts RFC sections');
    assertEq(t1.scope, 'トレイト定義', 'extracts scope');
    assertEq(t1.ticketId, 1, 'resolves ticketId from map');

    const t2 = result.completed[1];
    assertEq(t2.label, 'M-2-1.5', 'second ticket label is M-2-1.5');
    assertDeepEq(t2.rfcSections, ['§12.2', '§25'], 'extracts multiple RFC sections');
    assertEq(t2.ticketId, 2, 'resolves ticketId');

    const t3 = result.completed[2];
    assertEq(t3.label, 'M-2-2', 'third ticket label is M-2-2');
    assertEq(t3.ticketId, null, 'unmapped label yields null ticketId');
  });
}

// --- parseTicketsDoc missing file ---
console.log('\n## parseTicketsDoc (missing file)\n');
{
  withTempDir(tmpDir => {
    const result = parseTicketsDoc(tmpDir, {});
    assertEq(result, null, 'returns null when file missing');
  });
}

// --- parseTicketsDoc no completed ---
console.log('\n## parseTicketsDoc (no completed tickets)\n');
{
  withTempDir(tmpDir => {
    const docPath = path.join(tmpDir, 'Darvium-Tickets-v2.3.md');
    fs.writeFileSync(docPath, '# Empty\n\nNo tickets here.', 'utf8');
    const result = parseTicketsDoc(tmpDir, {});
    assert(result !== null, 'parses empty document');
    assertEq(result.completed.length, 0, 'no completed tickets');
  });
}

// --- checkConstants ---
console.log('\n## checkConstants\n');
{
  _resetCache();

  const r1 = checkConstants({ ticketId: 2 }, '/tmp');
  assert(r1.passed, 'ticket with empty expected constants passes');
  assertDeepEq(r1.checked, [], 'no constants checked');

  withTempDir(tmpDir => {
    const constDir = path.join(tmpDir, 'src');
    fs.mkdirSync(constDir, { recursive: true });
    fs.writeFileSync(path.join(constDir, 'constants.rs'),
      'pub const FAKE_LLM_DEFAULT_MALFORMED_PROB: f64 = 0.1;\n', 'utf8');

    const r = checkConstants({ ticketId: 3 }, tmpDir);
    assert(r.passed, 'finds expected constant');
    assertEq(r.checked.length, 1, 'one constant checked');
    assertEq(r.checked[0].found, true, 'constant found');
  });
}

// --- checkErrors ---
console.log('\n## checkErrors\n');
{
  _resetCache();
  withTempDir(tmpDir => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'error.rs'),
      'pub enum DarviumError {\n  Llm(String),\n  LlmMalformedJson(String),\n}\n', 'utf8');

    const r = checkErrors({ ticketId: 3 }, tmpDir);
    assert(r.passed, 'finds expected error variants');
    assertEq(r.checked.length, 2, 'two error variants checked');

    const r2 = checkErrors({ ticketId: 5 }, tmpDir);
    assert(r2.passed, 'ticket with empty error list passes');
  });
}

// --- checkRfcCrossRef ---
console.log('\n## checkRfcCrossRef\n');
{
  withTempDir(tmpDir => {
    fs.writeFileSync(path.join(tmpDir, 'Darvium-RFC-0001-Unified-v2.3-final.md'),
      '## 13.4 RetrievalPrimitive\n\n## 13.6 Guard\n', 'utf8');

    const r = checkRfcCrossRef({ rfcSections: ['§13.4', '§13.6'] }, tmpDir);
    assert(r.passed, 'all RFC sections found');
    assertEq(r.checked.length, 2, 'two sections checked');

    const r2 = checkRfcCrossRef({ rfcSections: ['§13.4', '§99.9'] }, tmpDir);
    assert(!r2.passed, 'fails when section not found');

    const r3 = checkRfcCrossRef({ rfcSections: [] }, tmpDir);
    assert(r3.passed, 'empty sections passes');
    assertDeepEq(r3.checked, [], 'no sections checked');
  });

  withTempDir(tmpDir => {
    const r4 = checkRfcCrossRef({ rfcSections: ['§13.4'] }, tmpDir);
    assert(!r4.passed, 'fails when RFC file missing');
  });
}

// --- checkArtifacts ---
console.log('\n## checkArtifacts\n');
{
  const rNoId = checkArtifacts({ ticketId: null }, '/tmp');
  assertEq(rNoId.plan, false, 'no ticketId → no plan');
  assertEq(rNoId.observationCount, 0, 'no ticketId → 0 observations');

  withTempDir(tmpDir => {
    const specsDir = path.join(tmpDir, 'tickets', 'specs');
    fs.mkdirSync(specsDir, { recursive: true });

    const specContent = [
      '---',
      'ticket_id: 1',
      'title: M-2-1: Test',
      'slug: test-ticket',
      'status: done',
      'plan_path: tickets/context/0001-test-ticket/plan.md',
      'implementation_path: tickets/context/0001-test-ticket/implementation.md',
      'review_report_path: tickets/context/0001-test-ticket/review.md',
      '---',
      '',
      '# Test',
    ].join('\n');
    fs.writeFileSync(path.join(specsDir, '0001-test-ticket.md'), specContent, 'utf8');

    const ctxDir = path.join(tmpDir, 'tickets', 'context', '0001-test-ticket');
    fs.mkdirSync(ctxDir, { recursive: true });
    fs.writeFileSync(path.join(ctxDir, 'plan.md'), '# Plan', 'utf8');
    fs.writeFileSync(path.join(ctxDir, 'implementation.md'), '# Impl', 'utf8');
    fs.writeFileSync(path.join(ctxDir, 'review.md'), '# Review', 'utf8');
    fs.writeFileSync(path.join(ctxDir, 'observation-20260522-120000.md'), '# Obs', 'utf8');
    fs.writeFileSync(path.join(ctxDir, 'observation-20260522-130000.md'), '# Obs 2', 'utf8');

    const r = checkArtifacts({ ticketId: 1 }, tmpDir);
    assert(r.plan, 'plan artifact found');
    assert(r.implementation, 'implementation artifact found');
    assert(r.review, 'review artifact found');
    assert(r.observation, 'observation found');
    assertEq(r.observationCount, 2, '2 observation files');

    const r2 = checkArtifacts({ ticketId: 999 }, tmpDir);
    assertEq(r2.plan, false, 'non-existent ticket → no artifacts');
  });
}

// --- checkAcceptance ---
console.log('\n## checkAcceptance\n');
{
  withTempDir(tmpDir => {
    const specsDir = path.join(tmpDir, 'tickets', 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    fs.writeFileSync(path.join(specsDir, '0001-test.md'),
      '---\nticket_id: 1\ntitle: Test\nslug: test\nstatus: done\n---\n\n## Acceptance Criteria\n\n- [x] Req 1\n- [ ] Req 2\n', 'utf8');

    const r = checkAcceptance({ ticketId: 1 }, tmpDir);
    assert(r.passed, 'acceptance check passes');
    assertEq(r.defined, 2, '2 acceptance criteria');

    const r2 = checkAcceptance({ ticketId: null }, '/tmp');
    assertEq(r2.defined, 0, 'null ticketId → 0 criteria');
  });
}

// --- checkTicket ---
console.log('\n## checkTicket\n');
{
  _resetCache();

  const tErr = { label: 'M-99-9', title: 'Unknown', ticketId: null, rfcSections: [], scope: '' };
  const rErr = checkTicket(tErr, '/tmp', '/tmp');
  assertEq(rErr.verdict, 'ERROR', 'null ticketId → ERROR verdict');
  assertEq(rErr.failures.length, 1, 'one failure');

  withTempDir(tmpDir => {
    const specsDir = path.join(tmpDir, 'tickets', 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    const specContent = [
      '---',
      'ticket_id: 1',
      'title: M-2-1: Test',
      'slug: test-ticket',
      'status: done',
      'plan_path: tickets/context/0001-test-ticket/plan.md',
      'implementation_path: tickets/context/0001-test-ticket/implementation.md',
      'review_report_path: tickets/context/0001-test-ticket/review.md',
      '---',
      '',
      '# Test',
      '## Acceptance Criteria',
      '- [x] Done',
    ].join('\n');
    fs.writeFileSync(path.join(specsDir, '0001-test-ticket.md'), specContent, 'utf8');

    const ctxDir = path.join(tmpDir, 'tickets', 'context', '0001-test-ticket');
    fs.mkdirSync(ctxDir, { recursive: true });
    fs.writeFileSync(path.join(ctxDir, 'plan.md'), '# Plan', 'utf8');
    fs.writeFileSync(path.join(ctxDir, 'implementation.md'), '# Impl', 'utf8');
    fs.writeFileSync(path.join(ctxDir, 'review.md'), '# Review', 'utf8');
    fs.writeFileSync(path.join(ctxDir, 'observation-20260522-120000.md'), '# Obs', 'utf8');

    fs.writeFileSync(path.join(tmpDir, 'Darvium-RFC-0001-Unified-v2.3-final.md'), '## 13.4 Content\n', 'utf8');

    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'constants.rs'),
      'pub const FAKE_LLM_DEFAULT_MALFORMED_PROB: f64 = 0.1;\n', 'utf8');
    // error.rs needs SearchValidation for ticketId=1
    fs.writeFileSync(path.join(tmpDir, 'src', 'error.rs'),
      'pub enum DarviumError {\n  SearchValidation,\n}\n', 'utf8');

    const t = { label: 'M-2-1', title: 'Test', ticketId: 1, rfcSections: ['§13.4'], scope: 'Test' };
    const r = checkTicket(t, tmpDir, tmpDir);
    assertEq(r.verdict, 'PASS', 'all checks pass → PASS verdict');
    assertEq(r.failures.length, 0, 'no failures');
    assertEq(r.warnings.length, 0, 'no warnings');
  });
}

// --- assembleReport ---
console.log('\n## assembleReport\n');
{
  const tickets = [
    { verdict: 'PASS', label: 'M-2-1', ticketId: 1, title: 'Test1', failures: [], warnings: [] },
    { verdict: 'WARN', label: 'M-2-2', ticketId: 2, title: 'Test2', failures: [], warnings: ['missing_observation'] },
    { verdict: 'FAIL', label: 'M-2-3', ticketId: 3, title: 'Test3', failures: ['missing_impl'], warnings: [] },
    { verdict: 'ERROR', label: 'M-99', ticketId: null, title: 'Unknown', failures: ['unresolved'], warnings: [] },
  ];
  const globalChecks = {
    cargo_test: { passed: true, exitCode: 0 },
    cargo_clippy: { passed: true, exitCode: 0 },
    cargo_fmt: { passed: true, exitCode: 0 },
    validate_structure: { passed: true, issues: 0 },
  };
  const translatability = { passed: true, total: 0, bySeverity: { major: 0, warning: 0, minor: 0 }, issues: [] };
  const report = assembleReport(tickets, globalChecks, translatability, '/tmp/darvium', 1234);

  assert(report.timestamp, 'has timestamp');
  assertEq(report.darviumRoot, '/tmp/darvium', 'includes darvium root');
  assertEq(report.durationMs, 1234, 'includes duration');
  assertEq(report.summary.total, 4, '4 tickets total');
  assertEq(report.summary.passed, 1, '1 passed');
  assertEq(report.summary.warnings, 1, '1 warning');
  assertEq(report.summary.failed, 1, '1 failed');
  assertEq(report.summary.errors, 1, '1 error');
  assertEq(report.tickets.length, 4, '4 tickets in report');
  assertEq(report.translatability.passed, true, 'translatability included');

  const json = JSON.stringify(report);
  assert(json.length > 0, 'report is JSON-serializable');
  assert(JSON.parse(json).summary.total === 4, 'JSON round-trips correctly');
}

// --- Summary ---
console.log(`\n━━━ Results ━━━\n  Passed: ${passed}\n  Failed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
