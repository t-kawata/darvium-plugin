const fs = require('fs');
const path = require('path');
const { CFG } = require('../../lib/tickets');

const CHECKS = {
  findUnwrap: {
    name: 'unwrap_expect',
    label: 'unwrap() / expect() usage',
    severity: 'major',
    run: (content, filePath) => {
      const results = [];
      const re = /\.(unwrap|expect)\(/g;
      let match;
      while ((match = re.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        results.push({ line: lineNum, match: match[0], file: filePath });
      }
      return results;
    },
  },
  findSingleLetterVars: {
    name: 'single_letter_vars',
    label: 'Single-letter variable names',
    severity: 'minor',
    run: (content, filePath) => {
      const results = [];
      const re = /\b(let|const|var|mut)\s+([a-df-z])\b(?!\s*=\s*(['"`{]|true|false|\d))/g;
      // Exclude common loop vars: i, j, k
      let match;
      while ((match = re.exec(content)) !== null) {
        const varName = match[2];
        if (['i', 'j', 'k'].includes(varName)) continue;
        const lineNum = content.substring(0, match.index).split('\n').length;
        results.push({ line: lineNum, match: `Variable '${varName}'`, file: filePath });
      }
      return results;
    },
  },
  findHardcodedPorts: {
    name: 'hardcoded_ports',
    label: 'Hardcoded port numbers',
    severity: 'major',
    run: (content, filePath) => {
      const results = [];
      const myCutePorts = [3910, 3911, 3912, 3913, 58300];
      const portRe = /\b(39[1-3]\d|58300)\b/g;
      // Only flag if appearing outside config/comments
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('//') || lines[i].trim().startsWith('#')) continue;
        const match = lines[i].match(portRe);
        if (match) {
          results.push({ line: i + 1, match: `Port ${match[0]}`, file: filePath });
        }
      }
      return results;
    },
  },
  findTodos: {
    name: 'todo_fixme',
    label: 'TODO / FIXME / HACK / XXX comments',
    severity: 'minor',
    run: (content, filePath) => {
      const results = [];
      const re = /\b(TODO|FIXME|HACK|XXX|WORKAROUND)\b/g;
      let match;
      while ((match = re.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        results.push({ line: lineNum, match: match[0], file: filePath });
      }
      return results;
    },
  },
  findCommentedCode: {
    name: 'commented_code',
    label: 'Commented-out code',
    severity: 'minor',
    run: (content, filePath) => {
      const results = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if ((trimmed.startsWith('//') || trimmed.startsWith('#')) &&
            (trimmed.includes('function') || trimmed.includes('=>') ||
             trimmed.includes('if (') || trimmed.includes('for (') ||
             trimmed.includes('return ') || trimmed.includes('let ') ||
             trimmed.includes('const ') || trimmed.includes('var '))) {
          results.push({ line: i + 1, match: 'Commented-out code detected', file: filePath });
        }
      }
      return results;
    },
  },
  findDebugOutput: {
    name: 'debug_output',
    label: 'Debug output statements',
    severity: 'major',
    run: (content, filePath) => {
      const results = [];
      const re = /\b(console\.log|dbg!|eprintln!|print!|println!)\s*\(/g;
      let match;
      while ((match = re.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        results.push({ line: lineNum, match: match[0], file: filePath });
      }
      return results;
    },
  },
  findUnsafe: {
    name: 'unsafe_blocks',
    label: 'unsafe blocks (Rust)',
    severity: 'major',
    run: (content, filePath) => {
      const results = [];
      const re = /\bunsafe\s*\{/g;
      let match;
      while ((match = re.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        results.push({ line: lineNum, match: 'unsafe block', file: filePath });
      }
      return results;
    },
  },
  findEmptyCatch: {
    name: 'empty_catch_else',
    label: 'Empty catch/else blocks',
    severity: 'major',
    run: (content, filePath) => {
      const results = [];
      const re = /(catch|else)\s*\{\s*\}/g;
      let match;
      while ((match = re.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split('\n').length;
        results.push({ line: lineNum, match: `Empty ${match[1]} block`, file: filePath });
      }
      return results;
    },
  },
  findManyParams: {
    name: 'many_params',
    label: 'Functions with many parameters',
    severity: 'minor',
    run: (content, filePath) => {
      const results = [];
      const re = /(?:fn|function)\s+\w+\s*\(([^)]*)\)/g;
      let match;
      while ((match = re.exec(content)) !== null) {
        const params = match[1].split(',').filter(p => p.trim());
        if (params.length > CFG.review.maxParams) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          results.push({ line: lineNum, match: `${params.length} params (max: ${CFG.review.maxParams})`, file: filePath });
        }
      }
      return results;
    },
  },
};

function runAllChecks(files) {
  const allResults = {};
  let totalIssues = 0;
  for (const [checkName, check] of Object.entries(CHECKS)) {
    const findings = [];
    for (const filePath of files) {
      if (!fs.existsSync(filePath)) continue;
      const ext = path.extname(filePath);
      if (!CFG.review.targetExtensions.includes(ext)) continue;
      // Skip review scripts themselves
      if (filePath.includes('scripts/tickets/')) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      const fileFindings = check.run(content, filePath);
      findings.push(...fileFindings);
    }
    if (findings.length > 0) {
      allResults[checkName] = { label: check.label, severity: check.severity, findings };
      totalIssues += findings.length;
    }
  }
  return { totalIssues, checks: allResults };
}

function main() {
  const targetFiles = process.argv.slice(2);
  if (targetFiles.length === 0) {
    console.log(JSON.stringify({ success: false, error: 'Usage: node run-quality-checks.js <file1> [file2 ...]' }));
    process.exit(1);
  }
  const results = runAllChecks(targetFiles);
  console.log(JSON.stringify({ success: true, ...results }));
}

if (require.main === module) main();
module.exports = { runAllChecks, CHECKS };
