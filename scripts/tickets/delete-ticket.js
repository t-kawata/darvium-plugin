const fs = require('fs');
const path = require('path');
const { validateTicketId, resolveAllPaths, readFrontmatterFromFile, removeFromQueue, CFG } = require('../lib/tickets');

function main() {
  const rawId = process.argv[2];
  if (!rawId) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node delete-ticket.js <ticket_id>' }));
    process.exit(1);
  }
  const ticketId = validateTicketId(rawId);
  if (!ticketId) {
    console.log(JSON.stringify({ success: false, error: 'Invalid ticket_id' }));
    process.exit(1);
  }
  const paths = resolveAllPaths(ticketId);
  const deleted = [];
  if (paths.specExists) {
    fs.unlinkSync(paths.specPath);
    deleted.push(paths.specPath);
  }
  if (fs.existsSync(paths.contextDir)) {
    fs.rmSync(paths.contextDir, { recursive: true, force: true });
    deleted.push(paths.contextDir);
  }
  if (fs.existsSync(paths.draftPath)) {
    fs.unlinkSync(paths.draftPath);
    deleted.push(paths.draftPath);
  }
  const queuePath = path.resolve(CFG.queueFile);
  removeFromQueue(queuePath, ticketId);
  console.log(JSON.stringify({ success: true, ticketId, deleted, queueCleaned: true }));
}

if (require.main === module) main();
module.exports = { main };
