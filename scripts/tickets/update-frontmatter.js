const path = require('path');
const { validateTicketId, resolveAllPaths, updateFrontmatterFields } = require('../lib/tickets');

function main() {
  const rawId = process.argv[2];
  const key = process.argv[3];
  const value = process.argv[4];
  if (!rawId || !key || value === undefined) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node update-frontmatter.js <ticket_id> <key> <value>' }));
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
  updateFrontmatterFields(paths.specPath, { [key]: value });
  console.log(JSON.stringify({ success: true, ticketId, updated: { [key]: value } }));
}

if (require.main === module) main();
module.exports = { main };
