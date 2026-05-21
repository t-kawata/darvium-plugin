const fs = require('fs');
const path = require('path');
const { parseFrontmatter, CFG } = require('../lib/tickets');

function main() {
  const targetSlug = process.argv[2];
  if (!targetSlug) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node find-by-slug.js <slug>' }));
    process.exit(1);
  }
  const specsDir = path.resolve(CFG.specsDir);
  if (!fs.existsSync(specsDir)) {
    console.log(JSON.stringify({ success: true, found: false, slug: targetSlug }));
    return;
  }
  const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(specsDir, file), 'utf8');
    const { attrs } = parseFrontmatter(content);
    if (attrs && attrs.slug === targetSlug) {
      console.log(JSON.stringify({ success: true, found: true, ticketId: attrs.ticket_id, title: attrs.title, slug: attrs.slug, status: attrs.status }));
      return;
    }
  }
  console.log(JSON.stringify({ success: true, found: false, slug: targetSlug }));
}

if (require.main === module) main();
module.exports = { main };
