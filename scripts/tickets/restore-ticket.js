const fs = require('fs');
const path = require('path');
const { validateTicketId, resolveAllPaths, CFG } = require('../lib/tickets');

function main() {
  const rawId = process.argv[2];
  if (!rawId) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node restore-ticket.js <ticket_id>' }));
    process.exit(1);
  }
  const ticketId = validateTicketId(rawId);
  if (!ticketId) {
    console.log(JSON.stringify({ success: false, error: 'Invalid ticket_id' }));
    process.exit(1);
  }
  const backupDir = path.resolve(CFG.backupDir);
  if (!fs.existsSync(backupDir)) {
    console.log(JSON.stringify({ success: false, error: 'No backup directory found' }));
    process.exit(1);
  }
  const prefix = String(ticketId).padStart(CFG.idPadding, '0');
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith(prefix) && f.endsWith('.md'))
    .sort()
    .reverse();
  if (backups.length === 0) {
    console.log(JSON.stringify({ success: false, error: `No backup found for ticket #${ticketId}` }));
    process.exit(1);
  }
  const latest = path.join(backupDir, backups[0]);
  const paths = resolveAllPaths(ticketId);
  if (!fs.existsSync(path.dirname(paths.specPath))) fs.mkdirSync(path.dirname(paths.specPath), { recursive: true });
  fs.copyFileSync(latest, paths.specPath);
  console.log(JSON.stringify({ success: true, ticketId, restoredFrom: latest, specPath: paths.specPath }));
}

if (require.main === module) main();
module.exports = { main };
