const path = require('path');
const fs = require('fs');
const {
  validateTicketId,
  resolveAllPaths,
  readFrontmatterFromFile,
} = require('../lib/tickets');

function main() {
  const rawId = process.argv[2];
  if (!rawId) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node resolve-ticket.js <ticket_id>' }));
    process.exit(1);
  }
  const ticketId = validateTicketId(rawId);
  if (!ticketId) {
    console.log(JSON.stringify({ success: false, error: 'Invalid ticket_id: must be a positive integer' }));
    process.exit(1);
  }
  const paths = resolveAllPaths(ticketId);
  if (!paths.specExists) {
    console.log(JSON.stringify({ success: true, exists: false, ticketId }));
    return;
  }
  function resolveWithFallback(rawPath, type) {
    if (!rawPath) return null;
    const resolved = path.isAbsolute(rawPath) ? rawPath : path.resolve(rawPath);
    if (fs.existsSync(resolved)) return resolved;
    // 絶対パスが存在しない場合、slug ベースの規約パスにフォールバックする
    const fallback = path.join(paths.contextDir, `${type}.md`);
    if (fs.existsSync(fallback)) return fallback;
    return resolved;
  }

  const { attrs } = readFrontmatterFromFile(paths.specPath);
  const planPath = resolveWithFallback(attrs?.plan_path, 'plan');
  const implementationPath = resolveWithFallback(attrs?.implementation_path, 'implementation');
  const reviewReportPath = resolveWithFallback(attrs?.review_report_path, 'review');

  console.log(JSON.stringify({
    success: true,
    exists: true,
    ticketId,
    title: attrs?.title || null,
    slug: attrs?.slug || null,
    status: attrs?.status || null,
    specPath: paths.specPath,
    contextDir: paths.contextDir,
    planPath,
    implementationPath,
    reviewReportPath,
  }));
}

if (require.main === module) main();
module.exports = { main };
