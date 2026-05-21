const fs = require('fs');
const path = require('path');
const { validateTicketId, resolveAllPaths, formatDate, CFG } = require('../lib/tickets');

function main() {
  const rawId = process.argv[2];
  if (!rawId) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node backup-ticket.js <ticket_id>' }));
    process.exit(1);
  }
  const ticketId = validateTicketId(rawId);
  if (!ticketId) {
    console.log(JSON.stringify({ success: false, error: 'Invalid ticket_id' }));
    process.exit(1);
  }
  const paths = resolveAllPaths(ticketId);
  if (!paths.specExists) {
    console.log(JSON.stringify({ success: false, error: `Ticket #${ticketId} not found` }));
    process.exit(1);
  }
  const backupDir = path.resolve(CFG.backupDir);
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = formatDate(new Date()) + '-' + Date.now();
  const backupName = `${String(ticketId).padStart(CFG.idPadding, '0')}-${timestamp}.md`;
  const backupPath = path.join(backupDir, backupName);
  fs.copyFileSync(paths.specPath, backupPath);
  console.log(JSON.stringify({ success: true, ticketId, backupPath }));
}

if (require.main === module) main();
module.exports = { main };
