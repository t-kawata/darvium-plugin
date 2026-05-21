const fs = require('fs');
const path = require('path');
const { parseFrontmatter, CFG } = require('../lib/tickets');

function main() {
  const specsDir = path.resolve(CFG.specsDir);
  const counts = {};
  for (const s of CFG.review.allowedStatuses) counts[s] = 0;
  let total = 0;
  if (fs.existsSync(specsDir)) {
    const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.md')).sort();
    for (const file of files) {
      const content = fs.readFileSync(path.join(specsDir, file), 'utf8');
      const { attrs } = parseFrontmatter(content);
      if (attrs && attrs.status) {
        counts[attrs.status] = (counts[attrs.status] || 0) + 1;
        total++;
      }
    }
  }
  console.log(JSON.stringify({ success: true, total, counts }));
}

if (require.main === module) main();
module.exports = { main };
