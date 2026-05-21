/**
 * レビュー結果レポート生成スクリプト
 *
 * run-quality-checks.js の出力を入力として受け取り、
 * 人間可読なレポート文字列を生成する。
 */

function generateReport(results) {
  const lines = [];
  lines.push('# Quality Check Report');
  lines.push('');
  lines.push(`**Total issues found: ${results.totalIssues}**`);
  lines.push('');

  const bySeverity = { blocker: [], major: [], minor: [] };
  for (const [checkName, checkData] of Object.entries(results.checks || {})) {
    const severity = checkData.severity || 'minor';
    if (bySeverity[severity]) {
      bySeverity[severity].push({ name: checkName, ...checkData });
    }
  }

  for (const severity of ['blocker', 'major', 'minor']) {
    const items = bySeverity[severity];
    if (items.length === 0) continue;
    const label = severity.charAt(0).toUpperCase() + severity.slice(1);
    lines.push(`## ${label} Issues`);
    lines.push('');
    for (const item of items) {
      lines.push(`### ${item.label}`);
      lines.push('');
      for (const f of item.findings || []) {
        lines.push(`- \`${f.file}:${f.line}\` — ${f.match}`);
      }
      lines.push('');
    }
  }

  if (results.totalIssues === 0) {
    lines.push('### ✅ All checks passed');
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const results = JSON.parse(input);
      if (!results.success) {
        console.log('Error: Input must be a successful quality check result');
        process.exit(1);
      }
      const report = generateReport(results);
      console.log(report);
    } catch (e) {
      console.error('Failed to parse input JSON:', e.message);
      process.exit(1);
    }
  });
}

if (require.main === module) main();
module.exports = { generateReport };
