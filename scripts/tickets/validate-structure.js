const fs = require('fs');
const path = require('path');
const { parseFrontmatter, parseQueueFile, CFG } = require('../lib/tickets');

function main() {
  const issues = [];
  const specsDir = path.resolve(CFG.specsDir);
  if (!fs.existsSync(specsDir)) {
    console.log(JSON.stringify({ success: true, valid: true, issues: [], summary: 'No specs directory yet' }));
    return;
  }
  const specFiles = fs.readdirSync(specsDir).filter(f => f.endsWith('.md')).sort();
  const specIds = new Set();
  for (const file of specFiles) {
    const fullPath = path.join(specsDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const { attrs } = parseFrontmatter(content);
    if (!attrs) {
      issues.push({ type: 'missing_frontmatter', file, detail: `No valid YAML frontmatter in ${file}` });
      continue;
    }
    const requiredFields = ['ticket_id', 'title', 'slug', 'status', 'created_at', 'updated_at'];
    for (const field of requiredFields) {
      if (!attrs[field]) issues.push({ type: 'missing_field', file, detail: `${file}: missing '${field}'` });
    }
    if (!CFG.review.allowedStatuses.includes(attrs.status)) {
      issues.push({ type: 'invalid_status', file, detail: `${file}: invalid status "${attrs.status}"` });
    }
    if (specIds.has(attrs.ticket_id)) {
      issues.push({ type: 'duplicate_id', file, detail: `${file}: duplicate ticket_id ${attrs.ticket_id}` });
    }
    specIds.add(attrs.ticket_id);
    const expectedName = `${String(attrs.ticket_id).padStart(CFG.idPadding, '0')}-${attrs.slug}.md`;
    // Check context directory naming later
  }
  const queuePath = path.resolve(CFG.queueFile);
  if (fs.existsSync(queuePath)) {
    const { entries } = parseQueueFile(queuePath);
    for (const entry of entries) {
      if (!specIds.has(entry.ticketId)) {
        issues.push({ type: 'orphan_queue_entry', detail: `Queue references ticket #${entry.ticketId} but no spec exists` });
      }
    }
  }
  const valid = issues.length === 0;
  console.log(JSON.stringify({ success: true, valid, issuesCount: issues.length, issues }));
}

if (require.main === module) main();
module.exports = { main };
