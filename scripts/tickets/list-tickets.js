const fs = require('fs');
const path = require('path');
const { parseFrontmatter, CFG } = require('../lib/tickets');

function main() {
  const filterStatus = process.argv[2] || null;
  const specsDir = path.resolve(CFG.specsDir);
  if (!fs.existsSync(specsDir)) {
    console.log(JSON.stringify({ success: true, tickets: [] }));
    return;
  }
  const tickets = [];
  const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.md')).sort();
  for (const file of files) {
    const fullPath = path.join(specsDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const { attrs } = parseFrontmatter(content);
    if (!attrs) continue;
    if (filterStatus && attrs.status !== filterStatus) continue;
    tickets.push({
      ticketId: attrs.ticket_id,
      title: attrs.title,
      slug: attrs.slug,
      status: attrs.status,
      specPath: fullPath,
    });
  }
  console.log(JSON.stringify({ success: true, count: tickets.length, tickets }));
}

if (require.main === module) main();
module.exports = { main };
