const { validateTicketId, resolveAllPaths, readFrontmatterFromFile } = require('../lib/tickets');

function main() {
  const rawId = process.argv[2];
  const expectedStatus = process.argv[3];
  if (!rawId || !expectedStatus) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node check-status.js <ticket_id> <expected_status>' }));
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
  const currentStatus = attrs?.status || null;
  const matches = currentStatus === expectedStatus;
  console.log(JSON.stringify({ success: true, ticketId, currentStatus, expectedStatus, matches }));
}

if (require.main === module) main();
module.exports = { main };
