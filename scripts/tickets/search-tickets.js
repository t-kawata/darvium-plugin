const fs = require('fs');
const path = require('path');
const { parseFrontmatter, CFG } = require('../lib/tickets');

function main() {
  const keyword = process.argv[2];
  const statusFilter = process.argv[3] || null;
  if (!keyword) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node search-tickets.js <keyword> [status_filter]' }));
    process.exit(1);
  }
  const specsDir = path.resolve(CFG.specsDir);
  const kw = keyword.toLowerCase();
  const results = [];
  if (fs.existsSync(specsDir)) {
    const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.md')).sort();
    for (const file of files) {
      const fullPath = path.join(specsDir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const { attrs } = parseFrontmatter(content);
      if (!attrs) continue;
      if (statusFilter && attrs.status !== statusFilter) continue;
      if (String(attrs.ticket_id).includes(kw) ||
          (attrs.title && attrs.title.toLowerCase().includes(kw)) ||
          (attrs.slug && attrs.slug.includes(kw))) {
        results.push({ ticketId: attrs.ticket_id, title: attrs.title, slug: attrs.slug, status: attrs.status });
      }
    }
  }
  console.log(JSON.stringify({ success: true, keyword, count: results.length, tickets: results }));
}

if (require.main === module) main();
module.exports = { main };
