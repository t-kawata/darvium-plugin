const path = require('path');
const fs = require('fs');
const {
  validateTicketId,
  resolveAllPaths,
  readFrontmatterFromFile,
  updateFrontmatterFields,
} = require('../lib/tickets');

const TYPES = { plan: 'plan_path', implementation: 'implementation_path', review: 'review_report_path', observation: 'observation_report_path' };

/**
 * YYYYMMDD-HHmmss 形式のタイムスタンプを生成する。
 * observation のファイル名に使用し、上書きを防止する。
 * @returns {string}
 */
function formatTimestamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}-${h}${min}${s}`;
}

function main() {
  const rawId = process.argv[2];
  const type = process.argv[3];

  if (!rawId || !type) {
    console.log(JSON.stringify({ success: false, error: 'Usage: echo "content" | node save-artifact.js <ticket_id> <type>' }));
    console.error('type: plan | implementation | review | observation');
    process.exit(1);
  }

  const ticketId = validateTicketId(rawId);
  if (!ticketId) {
    console.log(JSON.stringify({ success: false, error: 'Invalid ticket_id: must be a positive integer' }));
    process.exit(1);
  }

  const field = TYPES[type];
  if (!field) {
    console.log(JSON.stringify({ success: false, error: `Unknown type: "${type}". Expected: plan, implementation, review, observation` }));
    process.exit(1);
  }

  const paths = resolveAllPaths(ticketId);
  if (!paths.specExists) {
    console.log(JSON.stringify({ success: false, error: `Ticket #${ticketId} not found` }));
    process.exit(1);
  }

  // stdin から内容を読み取る
  let content = '';
  try {
    content = fs.readFileSync(process.stdin.fd, 'utf8');
  } catch (e) {
    console.log(JSON.stringify({ success: false, error: `Failed to read stdin: ${e.message}` }));
    process.exit(1);
  }
  if (!content.trim()) {
    console.log(JSON.stringify({ success: false, error: 'No content provided via stdin' }));
    process.exit(1);
  }

  // observation は常にタイムスタンプ付き新規ファイル、他は既存パスを再利用
  const { attrs } = readFrontmatterFromFile(paths.specPath);
  const existingPath = attrs?.[field];
  let artifactPath;
  if (type === 'observation') {
    artifactPath = path.join(paths.contextDir, `observation-${formatTimestamp()}.md`);
  } else if (existingPath && fs.existsSync(existingPath)) {
    artifactPath = path.isAbsolute(existingPath) ? existingPath : path.resolve(existingPath);
  } else {
    artifactPath = path.join(paths.contextDir, `${type}.md`);
  }

  // ファイル保存 + frontmatter 更新
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, content);
  updateFrontmatterFields(paths.specPath, { [field]: artifactPath });

  console.log(JSON.stringify({ success: true, ticketId, type, path: artifactPath }));
}

if (require.main === module) main();
module.exports = { main, TYPES };
