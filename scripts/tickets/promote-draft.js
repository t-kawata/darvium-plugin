const fs = require('fs');
const path = require('path');
const { validateTicketId, formatTicketId, readFrontmatterFromFile, createSpecFile, addToQueue, CFG } = require('../lib/tickets');

function findDraftFile(ticketId) {
  const prefix = formatTicketId(ticketId);
  const draftsDir = path.resolve(CFG.draftsDir);
  if (!fs.existsSync(draftsDir)) return null;
  const files = fs.readdirSync(draftsDir);
  const found = files.find(f => f.startsWith(prefix) && f.endsWith('.md'));
  return found ? path.join(draftsDir, found) : null;
}

function findSpecFile(ticketId) {
  const prefix = formatTicketId(ticketId);
  const specsDir = path.resolve(CFG.specsDir);
  if (!fs.existsSync(specsDir)) return null;
  const files = fs.readdirSync(specsDir);
  const found = files.find(f => f.startsWith(prefix) && f.endsWith('.md'));
  return found ? path.join(specsDir, found) : null;
}

function main() {
  const rawId = process.argv[2];
  if (!rawId) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node promote-draft.js <ticket_id>' }));
    process.exit(1);
  }
  const ticketId = validateTicketId(rawId);
  if (!ticketId) {
    console.log(JSON.stringify({ success: false, error: 'Invalid ticket_id' }));
    process.exit(1);
  }
  const draftPath = findDraftFile(ticketId);
  if (!draftPath) {
    console.log(JSON.stringify({ success: false, error: `No draft found for ticket #${ticketId}` }));
    process.exit(1);
  }
  const specPath = findSpecFile(ticketId);
  if (specPath) {
    console.log(JSON.stringify({ success: false, error: `Spec already exists at ${specPath}` }));
    process.exit(1);
  }
  const { attrs } = readFrontmatterFromFile(draftPath);
  const title = attrs?.title || `Ticket #${ticketId}`;
  const slug = attrs?.slug || 'untitled';
  const prefix = formatTicketId(ticketId);
  const resolvedSpecPath = path.resolve(CFG.specsDir, `${prefix}-${slug}.md`);
  const specsDir = path.dirname(resolvedSpecPath);
  if (!fs.existsSync(specsDir)) fs.mkdirSync(specsDir, { recursive: true });
  createSpecFile(resolvedSpecPath, ticketId, title, slug, 'draft');
  const ctxDir = path.resolve(CFG.contextDir, `${prefix}-${slug}`);
  if (!fs.existsSync(ctxDir)) fs.mkdirSync(ctxDir, { recursive: true });
  const queuePath = path.resolve(CFG.queueFile);
  if (!fs.existsSync(path.dirname(queuePath))) fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  addToQueue(queuePath, ticketId, title, resolvedSpecPath);
  console.log(JSON.stringify({ success: true, ticketId, title, slug, specPath: resolvedSpecPath, draftPath }));
}

if (require.main === module) main();
module.exports = { main };
