const path = require('path');
const fs = require('fs');
const {
  validateTicketId,
  resolveAllPaths,
  readFrontmatterFromFile,
} = require('../lib/tickets');

const FIELD_MAP = {
  plan: 'plan_path',
  implementation: 'implementation_path',
  review: 'review_report_path',
  observation: 'observation_report_path',
};

function main() {
  const rawId = process.argv[2];
  const type = process.argv[3] || '';

  if (!rawId || !type) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node read-artifact.js <ticket_id> <type>' }));
    console.error('type: spec | plan | implementation | review | observation');
    process.exit(1);
  }

  const ticketId = validateTicketId(rawId);
  if (!ticketId) {
    console.log(JSON.stringify({ success: false, error: 'Invalid ticket_id: must be a positive integer' }));
    process.exit(1);
  }

  const paths = resolveAllPaths(ticketId);
  if (!paths.specExists) {
    console.log(JSON.stringify({ success: false, error: `Ticket #${ticketId} not found` }));
    process.exit(1);
  }

  // spec: 直接 specPath を読む（frontmatter + body 全体）
  if (type === 'spec') {
    console.log(fs.readFileSync(paths.specPath, 'utf8'));
    return;
  }

  // それ以外: frontmatter から artifact パスを解決
  const field = FIELD_MAP[type];
  if (!field) {
    console.log(JSON.stringify({ success: false, error: `Unknown artifact type: "${type}". Expected: spec, plan, implementation, review, observation` }));
    process.exit(1);
  }

  const { attrs } = readFrontmatterFromFile(paths.specPath);
  const rawPath = attrs?.[field] || null;
  if (!rawPath) {
    console.log(JSON.stringify({ success: false, error: `Ticket #${ticketId}: ${field} is not set in frontmatter` }));
    process.exit(1);
  }

  let artifactPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(rawPath);
  if (!fs.existsSync(artifactPath)) {
    // 絶対パスが存在しない場合、slug ベースの規約パスにフォールバックする
    if (type === 'observation') {
      const ctxDir = paths.contextDir;
      if (fs.existsSync(ctxDir)) {
        const files = fs.readdirSync(ctxDir);
        const obsFile = files.find(f => f === 'observation.md' || (f.startsWith('observation-') && f.endsWith('.md')));
        if (obsFile) artifactPath = path.join(ctxDir, obsFile);
      }
    } else {
      const fallbackPath = path.join(paths.contextDir, `${type}.md`);
      if (fs.existsSync(fallbackPath)) artifactPath = fallbackPath;
    }
  }
  if (!fs.existsSync(artifactPath)) {
    console.log(JSON.stringify({ success: false, error: `Ticket #${ticketId}: ${type} not yet created at ${artifactPath}` }));
    process.exit(1);
  }

  console.log(fs.readFileSync(artifactPath, 'utf8'));
}

if (require.main === module) main();
module.exports = { main, FIELD_MAP };
