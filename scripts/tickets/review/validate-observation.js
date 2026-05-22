/**
 * 観測テスト完了確認スクリプト
 *
 * read-artifact.js 経由で observation アーティファクトを読み取り、
 * 必須セクションの存在を検証する。
 *
 * 使用方法: node validate-observation.js <ticket_id>
 * 出力: JSON { success: bool, valid: bool, hasBlocker: bool, issues: Array }
 */

const path = require('path');
const fs = require('fs');
const { validateTicketId, resolveAllPaths, readFrontmatterFromFile } = require('../lib/tickets');

const REQUIRED_SECTIONS = [
  { heading: '## 1.', label: '計装の実装状況', severity: 'major' },
  { heading: '## 2.', label: '観測テスト実行結果', severity: 'blocker' },
  { heading: '## 3.', label: '較正ループ', severity: 'major' },
  { heading: '## 4.', label: '現象の解釈', severity: 'major' },
  { heading: '## 5.', label: '目的関数', severity: 'minor' },
  { heading: '## 6.', label: '次チケットへの示唆', severity: 'minor' },
];

function validateObservation(ticketId) {
  const issues = [];
  const paths = resolveAllPaths(ticketId);

  if (!paths.specExists) {
    return { valid: false, issues: [{ check: 'spec_exists', severity: 'blocker', detail: `Ticket #${ticketId} not found` }] };
  }

  // observation_report_path の確認
  const { attrs } = readFrontmatterFromFile(paths.specPath);
  const obsPath = attrs?.observation_report_path;

  if (!obsPath) {
    return {
      valid: false,
      issues: [{
        check: 'observation_exists',
        severity: 'blocker',
        detail: 'observation_report_path is not set in spec frontmatter. Run /start-ticket to implement instrumentation and save observation report.',
      }],
    };
  }

  const resolvedPath = path.isAbsolute(obsPath) ? obsPath : path.resolve(obsPath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      valid: false,
      issues: [{
        check: 'observation_file',
        severity: 'blocker',
        detail: `Observation file not found at ${resolvedPath}`,
      }],
    };
  }

  const content = fs.readFileSync(resolvedPath, 'utf8');

  // 必須セクションの存在確認
  for (const section of REQUIRED_SECTIONS) {
    const found = content.split('\n').some(line => line.startsWith(section.heading));
    if (!found) {
      issues.push({
        check: `section_${section.label}`,
        severity: section.severity,
        detail: `Required section "${section.label}" (${section.heading}) not found in ${resolvedPath}`,
      });
    }
  }

  const hasBlocker = issues.some(i => i.severity === 'blocker');

  return {
    valid: issues.length === 0,
    hasObservation: true,
    hasBlocker,
    issuesCount: issues.length,
    issues,
  };
}

function main() {
  const rawId = process.argv[2];
  if (!rawId) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node validate-observation.js <ticket_id>' }));
    process.exit(1);
  }

  const ticketId = validateTicketId(rawId);
  if (!ticketId) {
    console.log(JSON.stringify({ success: false, error: 'Invalid ticket_id: must be a positive integer' }));
    process.exit(1);
  }

  const result = validateObservation(ticketId);
  console.log(JSON.stringify({ success: true, ...result }));
}

if (require.main === module) main();
module.exports = { validateObservation, REQUIRED_SECTIONS };
