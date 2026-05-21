const path = require('path');
const fs = require('fs');
const os = require('os');

const { runAllChecks } = require('../../scripts/tickets/review/run-quality-checks');
const { generateReport } = require('../../scripts/tickets/review/generate-report');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; process.stdout.write(`  ✓ ${message}\n`); }
  else { failed++; process.stdout.write(`  ✗ ${message}\n`); }
}

function assertEq(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write(`  ✓ ${message}\n`); }
  else { failed++; process.stdout.write(`  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}\n`); }
}

console.log('\n━━━ tickets/review.test.js ━━━\n');

// ===== Tests =====

// Create temp files with known issues
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-test-'));
const cleanFile = path.join(tmpDir, 'clean.rs');
const dirtyFile = path.join(tmpDir, 'dirty.rs');
const jsFile = path.join(tmpDir, 'app.js');

try {
  // Clean file (should pass all checks)
  fs.writeFileSync(cleanFile, [
    'fn calculate_total(items: &[Item]) -> f64 {',
    '    items.iter().map(|i| i.price).sum()',
    '}',
    '',
    'fn is_active(user: &User) -> bool {',
    '    user.status == "active"',
    '}',
    '',
  ].join('\n'));

  // Dirty file (has many issues)
  fs.writeFileSync(dirtyFile, [
    'fn process(x: &str) -> String {',
    '    let data = unsafe { load_data(x) };',           // unsafe
    '    let tmp = data.unwrap();',                       // unwrap
    '    if x == "test" {',
    '        if tmp.len() > 0 {',
    '            if tmp.contains("x") {',
    '                if tmp.len() > 5 {',
    '                    println!("debug: {}", tmp);',    // debug output
    '                    dbg!(tmp);',                     // dbg!
    '                }',
    '            }',
    '        }',
    '    }',
    '    // TODO: handle error case',                     // TODO
    '    // FIXME: this is slow',                         // FIXME
    '    try { } catch { }',                              // empty catch
    '    let val: i32 = 3910;',                           // hardcoded port
    '    ""',
    '}',
  ].join('\n'));

  // JS file with specific patterns
  fs.writeFileSync(jsFile, [
    'function process(data, info, tmp, val, x, y, z) {', // many params, single-letter vars
    '    console.log("debug");',                          // console.log
    '    if (data) { return data; }',
    '}',
  ].join('\n'));

  // ===============================================
  console.log('## runQualityChecks\n');

  {
    const result = runAllChecks([cleanFile]);
    assertEq(result.totalIssues, 0, 'clean file has no issues');
  }

  {
    const result = runAllChecks([dirtyFile]);
    assert(result.totalIssues > 0, 'dirty file has issues');
    assert(result.checks.findUnwrap, 'finds unwrap/expect');
    assert(result.checks.findUnsafe, 'finds unsafe blocks');
    assert(result.checks.findDebugOutput, 'finds debug output');
    assert(result.checks.findTodos, 'finds TODO/FIXME');
    assert(result.checks.findEmptyCatch, 'finds empty catch');
    assert(result.checks.findHardcodedPorts, 'finds hardcoded ports');
  }

  {
    const result = runAllChecks([jsFile]);
    assert(result.totalIssues > 0, 'JS file has issues');
    assert(result.checks.findDebugOutput, 'finds console.log');
    assert(result.checks.findManyParams, 'finds many params');
  }

  {
    const result = runAllChecks([cleanFile, dirtyFile, jsFile]);
    assert(result.totalIssues > 0, 'combined run finds issues');
    assert(Object.keys(result.checks).length >= 5, 'multiple check types found');
  }

  // ===============================================
  console.log('\n## generateReport\n');

  {
    const input = { success: true, totalIssues: 0, checks: {} };
    const report = generateReport(input);
    assert(report.includes('All checks passed'), 'empty report shows all pass');
    assert(report.includes('0'), 'shows zero issues');
  }

  {
    const result = runAllChecks([dirtyFile]);
    const report = generateReport(result);
    assert(report.includes('unwra'), 'report includes unwrap findings');
    assert(report.includes('unsafe'), 'report includes unsafe findings');
    assert(report.includes('TODO'), 'report includes TODO');
    assert(report.includes('dirty.rs'), 'report includes file name');
  }

} finally {
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Summary
console.log(`\n---\nPassed: ${passed}\nFailed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
