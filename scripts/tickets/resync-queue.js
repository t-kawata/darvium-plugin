const fs = require('fs');
const path = require('path');
const { parseFrontmatter, generateQueueLine, CFG } = require('../lib/tickets');

function main() {
  const specsDir = path.resolve(CFG.specsDir);
  if (!fs.existsSync(specsDir)) {
    console.log(JSON.stringify({ success: true, count: 0, message: 'No specs directory' }));
    return;
  }
  const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.md')).sort();
  const lines = ['# Ticket Queue\n'];
  let count = 0;
  for (const file of files) {
    const fullPath = path.join(specsDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const { attrs } = parseFrontmatter(content);
    if (!attrs || !attrs.ticket_id) continue;
    const specRelPath = path.relative(path.resolve(CFG.ticketsDir), fullPath);
    const checked = attrs.status === 'done';
    lines.push(generateQueueLine(attrs.ticket_id, attrs.title || 'Untitled', `tickets/${specRelPath}`, checked));
    count++;
  }
  lines.push('');
  const queuePath = path.resolve(CFG.queueFile);
  const qDir = path.dirname(queuePath);
  if (!fs.existsSync(qDir)) fs.mkdirSync(qDir, { recursive: true });
  fs.writeFileSync(queuePath, lines.join('\n'));
  console.log(JSON.stringify({ success: true, count, queuePath }));
}

if (require.main === module) main();
module.exports = { main };
