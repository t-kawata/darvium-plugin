const path = require('path');
const { validateTicketId, resolveAllPaths, readFrontmatterFromFile } = require('../lib/tickets');

function main() {
  const rawId = process.argv[2];
  const field = process.argv[3] || null;
  if (!rawId) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node read-frontmatter.js <ticket_id> [field]' }));
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
  const { attrs } = readFrontmatterFromFile(paths.specPath);
  if (field) {
    console.log(JSON.stringify({ success: true, field, value: attrs ? attrs[field] : null }));
  } else {
    console.log(JSON.stringify({ success: true, frontmatter: attrs }));
  }
}

if (require.main === module) main();
module.exports = { main };
