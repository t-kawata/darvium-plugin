const path = require('path');
const fs = require('fs');
const os = require('os');

const tickets = require('../../scripts/lib/tickets');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    process.stdout.write(`  ✓ ${message}\n`);
  } else {
    failed++;
    process.stdout.write(`  ✗ ${message}\n`);
  }
}

function assertEq(actual, expected, message) {
  const ok = actual === expected;
  if (ok) {
    passed++;
    process.stdout.write(`  ✓ ${message}\n`);
  } else {
    failed++;
    process.stdout.write(`  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}\n`);
  }
}

console.log('\n━━━ tickets/lib-tickets.test.js ━━━\n');

// --- validateTicketId ---
console.log('## validateTicketId\n');
assertEq(tickets.validateTicketId(42), 42, 'valid positive integer');
assertEq(tickets.validateTicketId('42'), 42, 'valid string integer');
assertEq(tickets.validateTicketId(0), null, 'zero is invalid');
assertEq(tickets.validateTicketId(-1), null, 'negative is invalid');
assertEq(tickets.validateTicketId('abc'), null, 'non-numeric string is invalid');
assertEq(tickets.validateTicketId(1.5), null, 'float is invalid');

// --- formatTicketId ---
console.log('\n## formatTicketId\n');
assertEq(tickets.formatTicketId(42), '0042', 'pads to 4 digits');
assertEq(tickets.formatTicketId(1), '0001', 'pads single digit');
assertEq(tickets.formatTicketId(12345), '12345', 'no padding when >4 digits');

// --- findNextTicketId ---
console.log('\n## findNextTicketId\n');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-test-'));
  const specsDir = path.join(tmpDir, 'specs');
  try {
    fs.mkdirSync(specsDir, { recursive: true });
    fs.writeFileSync(path.join(specsDir, '0041-old-ticket.md'), '---\nticket_id: 41\ntitle: Old\nslug: old\nstatus: done\ncreated_at: 2026-05-01\nupdated_at: 2026-05-10\n---\n');
    assertEq(tickets.findNextTicketId(specsDir), 42, 'next ID after existing max 41');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
assertEq(tickets.findNextTicketId('/nonexistent/path'), 1, 'returns 1 when dir missing');

// --- generateSlug ---
console.log('\n## generateSlug\n');
assertEq(tickets.generateSlug('Search Optimization'), 'search-optimization', 'basic kebab-case');
assertEq(tickets.generateSlug('Hello World!'), 'hello-world', 'removes special chars');
assertEq(tickets.generateSlug('  spaces  '), 'spaces', 'trims surrounding spaces');
assertEq(tickets.generateSlug(''), 'untitled', 'empty title defaults to untitled');
assertEq(tickets.generateSlug('ALLCAPS'), 'allcaps', 'lowercases');
assertEq(tickets.generateSlug('a---b'), 'a-b', 'collapses multiple hyphens');

// --- makeUniqueSlug ---
console.log('\n## makeUniqueSlug\n');
assertEq(tickets.makeUniqueSlug('test', ['a', 'b']), 'test', 'no conflict returns original');
assertEq(tickets.makeUniqueSlug('test', ['test']), 'test-2', 'appends -2 on conflict');
assertEq(tickets.makeUniqueSlug('test', ['test', 'test-2']), 'test-3', 'appends -3 when -2 taken');

// --- parseFrontmatter ---
console.log('\n## parseFrontmatter\n');
{
  const { attrs, body } = tickets.parseFrontmatter('---\nticket_id: 42\ntitle: Test\nslug: test\n---\n\n# Body');
  assert(attrs !== null, 'parses valid frontmatter');
  assertEq(attrs.ticket_id, 42, 'parses ticket_id as number');
  assertEq(attrs.title, 'Test', 'parses title');
  assertEq(attrs.slug, 'test', 'parses slug');
  assertEq(body.trim(), '# Body', 'extracts body');
}
{
  const { attrs, body } = tickets.parseFrontmatter('no frontmatter');
  assert(attrs === null, 'returns null for no frontmatter');
  assertEq(body, 'no frontmatter', 'body is full content');
}
{
  const result = tickets.parseFrontmatter('---\n---\ncontent');
  assert(result.attrs === null, 'empty frontmatter returns null');
}

// --- parseQueueLine ---
console.log('\n## parseQueueLine\n');
{
  const result = tickets.parseQueueLine('- [ ] #42 Search | tickets/specs/0042-search.md');
  assert(result !== null, 'parses unchecked line');
  assertEq(result.checked, false, 'unchecked');
  assertEq(result.ticketId, 42, 'ticketId 42');
  assertEq(result.title, 'Search', 'title');
  assertEq(result.specPath, 'tickets/specs/0042-search.md', 'specPath');
}
{
  const result = tickets.parseQueueLine('- [x] #41 Done | tickets/specs/0041-done.md');
  assert(result !== null, 'parses checked line');
  assertEq(result.checked, true, 'checked');
}
assert(tickets.parseQueueLine('# Header') === null, 'non-queue line returns null');
assert(tickets.parseQueueLine('') === null, 'empty line returns null');
{
  const result = tickets.parseQueueLine('- [x] #42 Search | tickets/specs/0042-search.md | 2026-05-01 | 2026-05-10 | 2026-05-20');
  assert(result !== null, 'parses line with dates');
  assertEq(result.createdAt, '2026-05-01', 'parses createdAt');
  assertEq(result.startedAt, '2026-05-10', 'parses startedAt');
  assertEq(result.completedAt, '2026-05-20', 'parses completedAt');
}
{
  const result = tickets.parseQueueLine('- [ ] #43 New | tickets/specs/0043-new.md | 2026-05-16');
  assert(result !== null, 'parses line with only createdAt');
  assertEq(result.createdAt, '2026-05-16', 'parses createdAt for unchecked');
  assertEq(result.startedAt, null, 'startedAt is null');
  assertEq(result.completedAt, null, 'completedAt is null');
}

// --- generateQueueLine ---
console.log('\n## generateQueueLine\n');
assertEq(tickets.generateQueueLine(42, 'Test', 'spec.md', false), '- [ ] #42 Test | spec.md', 'generates unchecked');
assertEq(tickets.generateQueueLine(41, 'Done', 'spec.md', true), '- [x] #41 Done | spec.md', 'generates checked');
assertEq(tickets.generateQueueLine(42, 'Test', 'spec.md', false, '2026-05-01'), '- [ ] #42 Test | spec.md | 2026-05-01', 'generates with createdAt');
assertEq(tickets.generateQueueLine(42, 'Test', 'spec.md', true, '2026-05-01', '2026-05-10', '2026-05-20'), '- [x] #42 Test | spec.md | 2026-05-01 | 2026-05-10 | 2026-05-20', 'generates with all dates');

// --- validateStatus ---
console.log('\n## validateStatus\n');
assert(tickets.validateStatus('draft'), 'draft is valid');
assert(tickets.validateStatus('approved'), 'approved is valid');
assert(tickets.validateStatus('done'), 'done is valid');
assert(tickets.validateStatus('reviewed'), 'reviewed is valid');
assert(!tickets.validateStatus('invalid'), 'invalid is not valid');

// --- validateTransition ---
console.log('\n## validateTransition\n');
assert(tickets.validateTransition('draft', 'reviewing'), 'draft -> reviewing allowed');
assert(!tickets.validateTransition('draft', 'implementing'), 'draft -> implementing NOT allowed');
assert(tickets.validateTransition('approved', 'implementing'), 'approved -> implementing allowed');
assert(tickets.validateTransition('implementing', 'done'), 'implementing -> done allowed');
assert(tickets.validateTransition('done', 'reviewed'), 'done -> reviewed allowed');
assert(tickets.validateTransition('done', 'implementing'), 'done -> implementing allowed (fallback)');
assert(!tickets.validateTransition('done', 'draft'), 'done -> draft NOT allowed');
assert(tickets.validateTransition('blocked', 'draft'), 'blocked -> draft allowed');

// --- getAllowedTransitions ---
console.log('\n## getAllowedTransitions\n');
{
  const t = tickets.getAllowedTransitions('draft');
  assert(Array.isArray(t), 'returns array');
  assertEq(t.includes('reviewing'), true, 'draft allows reviewing');
  assertEq(t.includes('approved'), false, 'draft does not allow approved');
}
assertEq(Array.isArray(tickets.getAllowedTransitions('nonexistent')), true, 'unknown status returns empty array');
assertEq(tickets.getAllowedTransitions('nonexistent').length, 0, 'unknown status has no transitions');

// --- formatDate ---
console.log('\n## formatDate\n');
assertEq(tickets.formatDate(new Date('2026-05-16')), '2026-05-16', 'formats date correctly');
assert(/^\d{4}-\d{2}-\d{2}$/.test(tickets.today()), 'today returns YYYY-MM-DD format');

// --- resolveSpecPath ---
console.log('\n## resolveSpecPath\n');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-test-'));
  try {
    const specsDir = path.join(tmpDir, 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    fs.writeFileSync(path.join(specsDir, '0041-old-ticket.md'), '---\nticket_id: 41\ntitle: Old\nslug: old\ntitle: Old\nstatus: done\n---\n');
    const result = tickets.resolveSpecPath(specsDir, 41);
    assert(result.exists, 'finds existing spec');
    const result2 = tickets.resolveSpecPath(specsDir, 99, 'new-ticket');
    assert(!result2.exists, 'nonexistent returns exists=false');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// --- readFrontmatterFromFile ---
console.log('\n## readFrontmatterFromFile\n');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-test-'));
  try {
    const specPath = path.join(tmpDir, 'spec.md');
    fs.writeFileSync(specPath, '---\nticket_id: 41\nstatus: done\n---\n');
    const { attrs } = tickets.readFrontmatterFromFile(specPath);
    assert(attrs !== null, 'reads frontmatter');
    assertEq(attrs.ticket_id, 41, 'reads ticket_id');
    assertEq(attrs.status, 'done', 'reads status');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// --- writeFrontmatter ---
console.log('\n## writeFrontmatter\n');
{
  const tmpFile = path.join(os.tmpdir(), 'write-fm-test-' + Date.now() + '.md');
  try {
    tickets.writeFrontmatter(tmpFile, { ticket_id: 1, title: 'New' });
    const { attrs } = tickets.readFrontmatterFromFile(tmpFile);
    assert(attrs !== null, 'writes frontmatter to new file');
    assertEq(attrs.ticket_id, 1, 'correct ticket_id');
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

// --- writeField / readField ---
console.log('\n## writeField / readField\n');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-test-'));
  try {
    const specPath = path.join(tmpDir, 'spec.md');
    fs.writeFileSync(specPath, '---\nticket_id: 41\nstatus: done\n---\n');
    assertEq(tickets.readField(specPath, 'status'), 'done', 'reads field');
    tickets.writeField(specPath, 'status', 'reviewing');
    assertEq(tickets.readField(specPath, 'status'), 'reviewing', 'writes field');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// --- updateFrontmatterFields ---
console.log('\n## updateFrontmatterFields\n');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-test-'));
  try {
    const specPath = path.join(tmpDir, 'spec.md');
    fs.writeFileSync(specPath, '---\nticket_id: 41\nstatus: done\n---\n');
    tickets.updateFrontmatterFields(specPath, { status: 'reviewing' });
    assertEq(tickets.readField(specPath, 'status'), 'reviewing', 'updates status');
    assertEq(tickets.readField(specPath, 'ticket_id'), 41, 'preserves other fields');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// --- createSpecFile ---
console.log('\n## createSpecFile\n');
{
  const tmpFile = path.join(os.tmpdir(), 'create-spec-test-' + Date.now() + '.md');
  try {
    const fm = tickets.createSpecFile(tmpFile, 99, 'New Feature', 'new-feature', 'draft');
    assertEq(fm.ticket_id, 99, 'returns correct frontmatter');
    const content = fs.readFileSync(tmpFile, 'utf8');
    assert(content.includes('Boy Scout Rule'), 'includes Boy Scout Rule section');
    assert(content.includes('Acceptance Criteria'), 'includes Acceptance Criteria');
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

// --- Queue operations ---
console.log('\n## Queue operations\n');
{
  const queueFile = path.join(os.tmpdir(), 'queue-test-' + Date.now() + '.md');
  try {
    tickets.addToQueue(queueFile, 42, 'Test', 'tickets/specs/0042-test.md');
    let parsed = tickets.parseQueueFile(queueFile);
    assertEq(parsed.entries.length, 1, 'adds entry');
    assertEq(parsed.entries[0].ticketId, 42, 'correct ID');

    tickets.addToQueue(queueFile, 42, 'Test', 'tickets/specs/0042-test.md');
    parsed = tickets.parseQueueFile(queueFile);
    assertEq(parsed.entries.length, 1, 'no duplicate on re-add');

    tickets.updateQueueEntry(queueFile, 42, { checked: true });
    parsed = tickets.parseQueueFile(queueFile);
    assert(parsed.entries[0].checked, 'updates checked status');

    tickets.removeFromQueue(queueFile, 42);
    parsed = tickets.parseQueueFile(queueFile);
    assertEq(parsed.entries.length, 0, 'removes entry');
  } finally {
    if (fs.existsSync(queueFile)) fs.unlinkSync(queueFile);
  }
}

// --- archiveExpiredEntries ---
console.log('\n## archiveExpiredEntries\n');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-test-'));
  try {
    const queuePath = path.join(tmpDir, 'queue.md');
    const archivePath = path.join(tmpDir, 'queue-archive.md');
    const oldDate = '2026-04-01'; // 45 days ago from 2026-05-16
    const recentDate = '2026-05-10'; // 6 days ago
    fs.writeFileSync(queuePath, '# Ticket Queue\n\n' +
      '- [x] #10 Old | specs/010-old.md | 2026-03-15 | 2026-03-20 | ' + oldDate + '\n' +
      '- [x] #11 Recent | specs/011-recent.md | 2026-05-01 | 2026-05-05 | ' + recentDate + '\n' +
      '- [ ] #12 Active | specs/012-active.md | 2026-05-10\n'
    );
    const result = tickets.archiveExpiredEntries(queuePath, archivePath, 14);
    assertEq(result.archived, 1, 'archives 1 expired entry');
    const queueContent = fs.readFileSync(queuePath, 'utf8');
    assert(!queueContent.includes('#10'), 'removed old completed entry from queue');
    assert(queueContent.includes('#11'), 'keeps recent completed entry');
    assert(queueContent.includes('#12'), 'keeps active entry');
    assert(fs.existsSync(archivePath), 'creates archive file');
    const archiveContent = fs.readFileSync(archivePath, 'utf8');
    assert(archiveContent.includes('#10'), 'moves old entry to archive');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// --- collectSlugs ---
console.log('\n## collectSlugs\n');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-test-'));
  try {
    const specsDir = path.join(tmpDir, 'specs');
    fs.mkdirSync(specsDir, { recursive: true });
    fs.writeFileSync(path.join(specsDir, '0041-old-ticket.md'), '---\nticket_id: 41\ntitle: Old\nslug: old\nstatus: done\n---\n');
    const slugs = tickets.collectSlugs(specsDir);
    assert(slugs.includes('old-ticket'), 'finds existing slug');
    assertEq(tickets.collectSlugs('/nonexistent').length, 0, 'empty for missing dir');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// --- generateSpecBody ---
console.log('\n## generateSpecBody\n');
{
  const body = tickets.generateSpecBody(42, 'Test Title', 'test-title');
  assert(body.includes('# Test Title'), 'includes title heading');
  assert(body.includes('Boy Scout Rule'), 'includes Boy Scout Rule section');
  assert(body.includes('Acceptance Criteria'), 'includes Acceptance Criteria');
  assert(body.includes('context/0042-test-title/plan.md'), 'includes plan path');
  assert(body.includes('context/0042-test-title/implementation.md'), 'includes implementation path');
  assert(body.includes('context/0042-test-title/review.md'), 'includes review path');
}

// Summary
console.log(`\n---\nPassed: ${passed}\nFailed: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
