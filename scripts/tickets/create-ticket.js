const fs = require('fs');
const path = require('path');
const {
  validateTicketId, findNextTicketId, generateSlug,
  makeUniqueSlug, resolveAllPaths, createSpecFile,
  addToQueue, collectSlugs, CFG,
} = require('../lib/tickets');

function main() {
  const rawId = process.argv[2];
  let ticketId = rawId ? validateTicketId(rawId) : null;
  let input = {};
  try {
    const stdin = fs.readFileSync(process.stdin.fd, 'utf8').trim();
    if (stdin) input = JSON.parse(stdin);
  } catch (e) { /* ignore */ }
  const title = process.argv[3] || input.title;
  if (!title) {
    console.log(JSON.stringify({ success: false, error: 'Title is required. Pass as 2nd arg or via stdin JSON.' }));
    process.exit(1);
  }
  const status = process.argv[4] || input.status || 'draft';
  const specsDir = path.resolve(CFG.specsDir);
  if (!fs.existsSync(specsDir)) fs.mkdirSync(specsDir, { recursive: true });
  if (!ticketId) ticketId = findNextTicketId(specsDir);
  const slug = generateSlug(title);
  const finalSlug = makeUniqueSlug(slug, collectSlugs(specsDir));
  const paths = resolveAllPaths(ticketId, finalSlug);
  if (paths.specExists) {
    console.log(JSON.stringify({ success: false, error: `Ticket #${ticketId} already exists at ${paths.specPath}` }));
    process.exit(1);
  }
  createSpecFile(paths.specPath, ticketId, title, finalSlug, status);
  fs.mkdirSync(paths.contextDir, { recursive: true });
  const queuePath = path.resolve(CFG.queueFile);
  if (!fs.existsSync(path.dirname(queuePath))) fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  addToQueue(queuePath, ticketId, title, paths.specPath);
  console.log(JSON.stringify({ success: true, ticketId, title, slug: finalSlug, status, specPath: paths.specPath, contextDir: paths.contextDir }));
}

if (require.main === module) main();
module.exports = { main };
