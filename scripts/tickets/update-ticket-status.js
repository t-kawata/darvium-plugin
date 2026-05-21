const fs = require('fs');
const path = require('path');
const { validateTicketId, resolveAllPaths, readFrontmatterFromFile, updateFrontmatterFields, validateTransition, validateStatus, parseQueueFile, updateQueueEntry, archiveExpiredEntries, CFG } = require('../lib/tickets');

function formatDate(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function main() {
  const rawId = process.argv[2];
  const newStatus = process.argv[3];
  if (!rawId || !newStatus) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node update-ticket-status.js <ticket_id> <new_status>' }));
    process.exit(1);
  }
  const ticketId = validateTicketId(rawId);
  if (!ticketId) {
    console.log(JSON.stringify({ success: false, error: 'Invalid ticket_id' }));
    process.exit(1);
  }
  if (!validateStatus(newStatus)) {
    console.log(JSON.stringify({ success: false, error: `Invalid status: "${newStatus}". Allowed: ${CFG.review.allowedStatuses.join(', ')}` }));
    process.exit(1);
  }
  const paths = resolveAllPaths(ticketId);
  if (!paths.specExists) {
    console.log(JSON.stringify({ success: false, error: `Ticket #${ticketId} not found` }));
    process.exit(1);
  }
  const { attrs } = readFrontmatterFromFile(paths.specPath);
  const currentStatus = attrs?.status || 'draft';
  if (currentStatus === newStatus) {
    console.log(JSON.stringify({ success: true, ticketId, status: newStatus, unchanged: true }));
    return;
  }
  if (!validateTransition(currentStatus, newStatus)) {
    const allowed = CFG.review.validTransitions[currentStatus] || [];
    console.log(JSON.stringify({ success: false, error: `Cannot transition from "${currentStatus}" to "${newStatus}". Allowed: ${allowed.join(', ') || '(none)'}` }));
    process.exit(1);
  }
  updateFrontmatterFields(paths.specPath, { status: newStatus, updated_at: formatDate() });
  const queuePath = path.resolve(CFG.queueFile);
  if (fs.existsSync(queuePath)) {
    if (newStatus === 'implementing') {
      const { entries } = parseQueueFile(queuePath);
      const entry = entries.find(e => e.ticketId === ticketId);
      if (entry && !entry.startedAt) {
        updateQueueEntry(queuePath, ticketId, { startedAt: formatDate() });
      }
    }
    if (newStatus === 'reviewed') {
      updateQueueEntry(queuePath, ticketId, { checked: true, completedAt: formatDate() });
      archiveExpiredEntries(queuePath, path.resolve(CFG.queueArchiveFile), CFG.archivalDays);
    }
  }
  console.log(JSON.stringify({ success: true, ticketId, from: currentStatus, to: newStatus }));
}

if (require.main === module) main();
module.exports = { main };
