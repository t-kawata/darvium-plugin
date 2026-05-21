const fs = require('fs');
const path = require('path');
const { CFG } = require('../lib/tickets');

function main() {
  const dirs = [
    CFG.ticketsDir,
    CFG.specsDir,
    CFG.contextDir,
    CFG.draftsDir,
  ];
  const created = [];
  const existed = [];
  for (const relDir of dirs) {
    const absDir = path.resolve(relDir);
    if (!fs.existsSync(absDir)) {
      fs.mkdirSync(absDir, { recursive: true });
      created.push(relDir);
    } else {
      existed.push(relDir);
    }
  }
  const queuePath = path.resolve(CFG.queueFile);
  if (!fs.existsSync(queuePath)) {
    const qDir = path.dirname(queuePath);
    if (!fs.existsSync(qDir)) fs.mkdirSync(qDir, { recursive: true });
    fs.writeFileSync(queuePath, '# Ticket Queue\n\n');
    created.push(CFG.queueFile);
  } else {
    existed.push(CFG.queueFile);
  }
  console.log(JSON.stringify({ success: true, created, existed }));
}

if (require.main === module) main();
module.exports = { main };
