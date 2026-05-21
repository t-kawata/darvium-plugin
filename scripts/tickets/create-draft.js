const fs = require('fs');
const path = require('path');
const { validateTicketId, resolveAllPaths, generateSlug, today, CFG } = require('../lib/tickets');

function main() {
  const rawId = process.argv[2];
  const title = process.argv[3];
  if (!rawId) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node create-draft.js <ticket_id> [title]' }));
    process.exit(1);
  }
  const ticketId = validateTicketId(rawId);
  if (!ticketId) {
    console.log(JSON.stringify({ success: false, error: 'Invalid ticket_id' }));
    process.exit(1);
  }
  const resolvedTitle = title || `Ticket #${ticketId}`;
  const slug = generateSlug(resolvedTitle);
  const paths = resolveAllPaths(ticketId, slug);
  if (fs.existsSync(paths.draftPath)) {
    console.log(JSON.stringify({ success: false, error: `Draft already exists at ${paths.draftPath}` }));
    process.exit(1);
  }
  const draftsDir = path.resolve(CFG.draftsDir);
  if (!fs.existsSync(draftsDir)) fs.mkdirSync(draftsDir, { recursive: true });
  const now = today();
  const content = `---\nticket_id: ${ticketId}\ntitle: ${resolvedTitle}\nslug: ${slug}\nstatus: draft\ncreated_at: ${now}\nupdated_at: ${now}\n---\n\n# ${resolvedTitle}\n\n<!-- Draft -- promote with promote-draft.js -->\n\n`;
  fs.writeFileSync(paths.draftPath, content);
  console.log(JSON.stringify({ success: true, ticketId, title: resolvedTitle, slug, draftPath: paths.draftPath }));
}

if (require.main === module) main();
module.exports = { main };
