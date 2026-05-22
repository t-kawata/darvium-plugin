/**
 * チケットシステム共通ユーティリティ
 *
 * すべての ticket スクリプトから利用される共通処理を提供する。
 * ファイル操作、frontmatter パース、slug 生成、status 遷移検証等。
 */

const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./ticket-config");

const CFG = loadConfig();

// ============================================================
// ID Utilities
// ============================================================

/**
 * ticket_id が正の整数か検証する。
 * @param {*} value - 検証する値
 * @returns {number|null} 有効な場合は数値、無効な場合は null
 */
function validateTicketId(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

/**
 * ticket_id をゼロ埋め文字列にフォーマットする。
 * @param {number} id - チケットID
 * @returns {string} "0042" 形式
 */
function formatTicketId(id) {
  return String(id).padStart(CFG.idPadding, "0");
}

/**
 * specs ディレクトリから次に使える空き ticket_id を採番する。
 * 既存の最大値 + 1 を返す。1件もない場合は 1 を返す。
 * @param {string} specsDir - specs ディレクトリの絶対パス
 * @returns {number}
 */
function findNextTicketId(specsDir) {
  if (!fs.existsSync(specsDir)) return 1;
  const files = fs.readdirSync(specsDir);
  let max = 0;
  for (const file of files) {
    const match = file.match(/^(\d+)-/);
    if (match) {
      const id = parseInt(match[1], 10);
      if (id > max) max = id;
    }
  }
  return max + 1;
}

// ============================================================
// Slug Utilities
// ============================================================

/**
 * タイトルから slug を生成する（kebab-case）。
 * @param {string} title - チケットタイトル
 * @returns {string}
 */
function generateSlug(title) {
  return (
    title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

/**
 * 既存の slug 一覧と重複しない slug を生成する。
 * 重複時は "-2", "-3" のサフィックスを付加する。
 * @param {string} slug - 基本 slug
 * @param {string[]} existingSlugs - 既存の slug 一覧
 * @returns {string}
 */
function makeUniqueSlug(slug, existingSlugs) {
  if (!existingSlugs.includes(slug)) return slug;
  let counter = 2;
  while (existingSlugs.includes(`${slug}-${counter}`)) {
    counter++;
  }
  return `${slug}-${counter}`;
}

/**
 * specs ディレクトリ内の全 slug を取得する。
 * @param {string} specsDir
 * @returns {string[]}
 */
function collectSlugs(specsDir) {
  if (!fs.existsSync(specsDir)) return [];
  return fs
    .readdirSync(specsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const match = f.match(/^\d+-(.+)\.md$/);
      return match ? match[1] : null;
    })
    .filter(Boolean);
}

// ============================================================
// Path Resolution
// ============================================================

/**
 * ticket_id に対応する spec ファイルの絶対パスを解決する。
 * @param {string} specsDir - specs ディレクトリの絶対パス
 * @param {number} ticketId
 * @param {string} [slug] - 未作成時に使用する slug
 * @returns {{ path: string, exists: boolean }}
 */
function resolveSpecPath(specsDir, ticketId, slug) {
  const prefix = formatTicketId(ticketId);
  if (fs.existsSync(specsDir)) {
    const files = fs.readdirSync(specsDir);
    const found = files.find((f) => f.startsWith(prefix) && f.endsWith(".md"));
    if (found) {
      return { path: path.join(specsDir, found), exists: true };
    }
  }
  const filename = slug ? `${prefix}-${slug}.md` : `${prefix}-untitled.md`;
  return { path: path.join(specsDir, filename), exists: false };
}

/**
 * 指定された ticket_id について全関連パスを解決する。
 * @param {number} ticketId
 * @param {string} [slug]
 * @returns {{ specPath: string, contextDir: string, draftPath: string, specExists: boolean }}
 */
function resolveAllPaths(ticketId, slug) {
  const prefix = formatTicketId(ticketId);
  const specsDir = path.resolve(CFG.specsDir);
  const { path: specPath, exists: specExists } = resolveSpecPath(
    specsDir,
    ticketId,
    slug,
  );

  let resolvedSlug = slug;
  if (!resolvedSlug && specExists) {
    const basename = path.basename(specPath, ".md");
    const match = basename.match(/^\d+-(.+)$/);
    if (match) resolvedSlug = match[1];
  }
  const slugPart = resolvedSlug || "untitled";
  const contextDir = path.resolve(CFG.contextDir, `${prefix}-${slugPart}`);
  const draftPath = path.resolve(CFG.draftsDir, `${prefix}-${slugPart}.md`);

  return { specPath, contextDir, draftPath, specExists };
}

// ============================================================
// Frontmatter Utilities
// ============================================================

/**
 * Markdown 本文から YAML frontmatter を抽出する。
 * @param {string} content - ファイル全文
 * @returns {{ attrs: object|null, body: string }}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { attrs: null, body: content };
  }
  const yamlStr = match[1];
  const body = match[2] || "";
  const attrs = {};
  for (const line of yamlStr.split("\n")) {
    const kv = line.match(/^(\w[\w_]*):\s*(.*)$/);
    if (kv) {
      let value = kv[2].trim();
      if (/^\d+$/.test(value)) {
        attrs[kv[1]] = parseInt(value, 10);
      } else {
        attrs[kv[1]] = value;
      }
    }
  }
  return { attrs: Object.keys(attrs).length > 0 ? attrs : null, body };
}

/**
 * frontmatter オブジェクトを YAML 文字列に変換する。
 * @param {object} data
 * @returns {string}
 */
function stringifyFrontmatter(data) {
  return Object.entries(data)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

/**
 * ファイルから frontmatter を読み取る。
 * @param {string} filePath
 * @returns {{ attrs: object|null, body: string }}
 */
function readFrontmatterFromFile(filePath) {
  if (!fs.existsSync(filePath)) return { attrs: null, body: "" };
  const content = fs.readFileSync(filePath, "utf8");
  return parseFrontmatter(content);
}

/**
 * ファイルの全 frontmatter 属性を上書き保存する。
 * @param {string} filePath
 * @param {object} newAttrs
 */
function writeFrontmatter(filePath, newAttrs) {
  if (!fs.existsSync(filePath)) {
    const yaml = stringifyFrontmatter(newAttrs);
    fs.writeFileSync(filePath, `---\n${yaml}\n---\n\n`);
    return;
  }
  const { body } = readFrontmatterFromFile(filePath);
  const yaml = stringifyFrontmatter(newAttrs);
  fs.writeFileSync(filePath, `---\n${yaml}\n---\n${body}`);
}

/**
 * 特定の frontmatter フィールドを読み取る。
 * @param {string} filePath
 * @param {string} field
 * @returns {*|null}
 */
function readField(filePath, field) {
  const { attrs } = readFrontmatterFromFile(filePath);
  return attrs ? attrs[field] : null;
}

/**
 * 特定の frontmatter フィールドを更新する（他のフィールドは維持）。
 * @param {string} filePath
 * @param {string} field
 * @param {*} value
 */
function writeField(filePath, field, value) {
  const { attrs, body } = readFrontmatterFromFile(filePath);
  const merged = { ...(attrs || {}), [field]: value };
  const yaml = stringifyFrontmatter(merged);
  fs.writeFileSync(filePath, `---\n${yaml}\n---\n${body}`);
}

/**
 * ファイルから複数の frontmatter フィールドを一括更新する。
 * @param {string} filePath
 * @param {object} updates
 */
function updateFrontmatterFields(filePath, updates) {
  const { attrs, body } = readFrontmatterFromFile(filePath);
  const merged = { ...(attrs || {}), ...updates };
  const yaml = stringifyFrontmatter(merged);
  fs.writeFileSync(filePath, `---\n${yaml}\n---\n${body}`);
}

// ============================================================
// Spec File Utilities
// ============================================================

/**
 * spec ファイルを frontmatter と本文に分割して読み込む。
 * @param {string} filePath
 * @returns {{ frontmatter: object|null, body: string, fullContent: string }}
 */
function loadSpec(filePath) {
  if (!fs.existsSync(filePath))
    return { frontmatter: null, body: "", fullContent: "" };
  const fullContent = fs.readFileSync(filePath, "utf8");
  const { attrs, body } = parseFrontmatter(fullContent);
  return { frontmatter: attrs, body, fullContent };
}

/**
 * spec ファイルを frontmatter + body の形式で保存する。
 * @param {string} filePath
 * @param {object} frontmatter
 * @param {string} body
 */
function saveSpecFrontmatter(filePath, frontmatter, body) {
  const yaml = stringifyFrontmatter(frontmatter);
  const content = body ? `---\n${yaml}\n---\n${body}` : `---\n${yaml}\n---\n`;
  fs.writeFileSync(filePath, content);
}

// ============================================================
// Queue Utilities
// ============================================================

/**
 * queue.md の 1行をパースする。
 * @param {string} line
 * @returns {{ checked: boolean, ticketId: number|null, title: string|null, specPath: string|null }|null}
 */
function parseQueueLine(line) {
  const trimmed = line.trim();
  const match = trimmed.match(/^- \[([ x])\] #(\d+)\s+(.+?)\s*\|\s*(.+)$/);
  if (!match) return null;
  const parts = match[4].split("|").map((s) => s.trim());
  return {
    checked: match[1] === "x",
    ticketId: parseInt(match[2], 10),
    title: match[3].trim(),
    specPath: parts[0],
    createdAt:
      parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) ? parts[1] : null,
    startedAt:
      parts[2] && /^\d{4}-\d{2}-\d{2}$/.test(parts[2]) ? parts[2] : null,
    completedAt:
      parts[3] && /^\d{4}-\d{2}-\d{2}$/.test(parts[3]) ? parts[3] : null,
  };
}

/**
 * queue の 1行を生成する。
 * @param {number} ticketId
 * @param {string} title
 * @param {string} specPath
 * @param {boolean} [checked=false]
 * @returns {string}
 */
function generateQueueLine(
  ticketId,
  title,
  specPath,
  checked,
  createdAt,
  startedAt,
  completedAt,
) {
  const mark = checked ? "x" : " ";
  let line = `- [${mark}] #${ticketId} ${title} | ${specPath}`;
  if (createdAt) line += ` | ${createdAt}`;
  if (startedAt) line += ` | ${startedAt}`;
  if (completedAt) line += ` | ${completedAt}`;
  return line;
}

/**
 * queue.md ファイルをパースする。
 * @param {string} queuePath
 * @returns {{ entries: Array, headerLines: string[] }}
 */
function parseQueueFile(queuePath) {
  if (!fs.existsSync(queuePath)) return { entries: [], headerLines: [] };
  const content = fs.readFileSync(queuePath, "utf8");
  const lines = content.split("\n");
  const headerLines = [];
  const entries = [];
  for (const line of lines) {
    const parsed = parseQueueLine(line);
    if (parsed) {
      entries.push(parsed);
    } else if (!parsed && line.trim()) {
      headerLines.push(line);
    }
  }
  return { entries, headerLines };
}

/**
 * queue に新しいエントリを追加する。
 * @param {string} queuePath
 * @param {number} ticketId
 * @param {string} title
 * @param {string} specPath
 */
function addToQueue(queuePath, ticketId, title, specPath) {
  archiveExpiredEntries(queuePath, path.resolve(CFG.queueArchiveFile), CFG.archivalDays);
  const parsed = parseQueueFile(queuePath);
  if (parsed.entries.some((e) => e.ticketId === ticketId)) return;
  const createdAt = today();
  const newLine = generateQueueLine(ticketId, title, specPath, false, createdAt);
  const header =
    parsed.headerLines.length > 0
      ? parsed.headerLines.join("\n") + "\n"
      : "# Ticket Queue\n\n";
  const lines = parsed.entries.map((e) =>
    generateQueueLine(e.ticketId, e.title, e.specPath, e.checked, e.createdAt, e.startedAt, e.completedAt)
  );
  lines.push(newLine);
  fs.writeFileSync(queuePath, header + lines.join("\n") + "\n");
}

/**
 * queue 内のエントリを更新する。
 * @param {string} queuePath
 * @param {number} ticketId
 * @param {{ title?: string, specPath?: string, checked?: boolean }} updates
 */
function updateQueueEntry(queuePath, ticketId, updates) {
  const { entries, headerLines } = parseQueueFile(queuePath);
  const newEntries = entries.map((e) => {
    if (e.ticketId !== ticketId) return e;
    return { ...e, ...updates };
  });
  const header = headerLines.join("\n") + "\n";
  const lines = newEntries.map((e) =>
    generateQueueLine(
      e.ticketId,
      e.title,
      e.specPath,
      e.checked,
      e.createdAt,
      e.startedAt,
      e.completedAt,
    ),
  );
  fs.writeFileSync(queuePath, header + lines.join("\n") + "\n");
}

/**
 * queue からエントリを削除する。
 * @param {string} queuePath
 * @param {number} ticketId
 */
function removeFromQueue(queuePath, ticketId) {
  const { entries, headerLines } = parseQueueFile(queuePath);
  const filtered = entries.filter((e) => e.ticketId !== ticketId);
  if (filtered.length === entries.length) return;
  const header = headerLines.join("\n") + "\n";
  const lines = filtered.map((e) =>
    generateQueueLine(
      e.ticketId,
      e.title,
      e.specPath,
      e.checked,
      e.createdAt,
      e.startedAt,
      e.completedAt,
    ),
  );
  fs.writeFileSync(queuePath, header + lines.join("\n") + "\n");
}

/**
 * queue から完了から14日以上経過したエントリを archive に移動する。
 * @param {string} queuePath
 * @param {string} archivePath
 * @param {number} archivalDays
 * @returns {{ archived: number }}
 */
function archiveExpiredEntries(queuePath, archivePath, archivalDays) {
  if (!fs.existsSync(queuePath)) return { archived: 0 };
  const { entries, headerLines } = parseQueueFile(queuePath);
  const now = Date.now();
  const active = [];
  const expired = [];
  for (const entry of entries) {
    if (entry.checked && entry.completedAt) {
      const ms = Date.parse(entry.completedAt);
      if (!isNaN(ms)) {
        const daysSince = Math.floor((now - ms) / (1000 * 60 * 60 * 24));
        if (daysSince >= archivalDays) {
          expired.push(entry);
          continue;
        }
      }
    }
    active.push(entry);
  }
  if (expired.length === 0) return { archived: 0 };
  const todayStr = today();
  const archiveLines = expired.map((e) =>
    generateQueueLine(
      e.ticketId,
      e.title,
      e.specPath,
      e.checked,
      e.createdAt,
      e.startedAt,
      e.completedAt,
    ),
  );
  const archiveSection = `## Archived on ${todayStr}\n${archiveLines.join("\n")}\n`;
  const archiveContent = fs.existsSync(archivePath)
    ? fs.readFileSync(archivePath, "utf8").replace(/\n$/, "") +
      "\n\n" +
      archiveSection
    : "# Queue Archive\n\n" + archiveSection;
  fs.writeFileSync(archivePath, archiveContent);
  const header = headerLines.join("\n") + "\n";
  const lines = active.map((e) =>
    generateQueueLine(
      e.ticketId,
      e.title,
      e.specPath,
      e.checked,
      e.createdAt,
      e.startedAt,
      e.completedAt,
    ),
  );
  fs.writeFileSync(queuePath, header + lines.join("\n") + "\n");
  return { archived: expired.length };
}

// ============================================================
// Status Utilities
// ============================================================

/**
 * status 値が許容済み一覧に含まれるか検証する。
 * @param {string} status
 * @returns {boolean}
 */
function validateStatus(status) {
  return CFG.review.allowedStatuses.includes(status);
}

/**
 * status 遷移がルールに従っているか検証する。
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function validateTransition(from, to) {
  const allowed = CFG.review.validTransitions[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * 指定 status から遷移可能な status 一覧を返す。
 * @param {string} from
 * @returns {string[]}
 */
function getAllowedTransitions(from) {
  return CFG.review.validTransitions[from] || [];
}

// ============================================================
// Date Utilities
// ============================================================

/**
 * Date オブジェクトを "YYYY-MM-DD" 形式にフォーマットする。
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
function formatDate(date) {
  const d = date || new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 本日の日付文字列を "YYYY-MM-DD" 形式で返す。
 * @returns {string}
 */
function today() {
  return formatDate(new Date());
}

// ============================================================
// Spec Template
// ============================================================

/**
 * spec ファイルのテンプレート本文を生成する。
 * @param {number} ticketId
 * @param {string} title
 * @returns {string}
 */
function generateSpecBody(ticketId, title, slug) {
  const prefix = formatTicketId(ticketId);
  const slugPart = slug || 'untitled';
  const contextDir = `context/${prefix}-${slugPart}`;

  return `# ${title}

## Summary

<!-- このチケットで達成することの簡潔な説明 -->

## Background

<!-- なぜこのチケットが必要か -->

## Scope

<!-- 何をするか -->

## Non-scope

<!-- 何をしないか -->

## Investigation

<!--
憶測や論理的な推論だけでは不十分である。ソースコードの解析、grep、解析調査用テストコードの作成、テストの実行、ログの確認などを通じて**物理的な証拠**を見つけ出し、ここに記録すること。

記録すべき証拠の例：
- エラーメッセージ、スタックトレース、テスト失敗の再現手順
- grep や検索で見つけた関連コードの該当箇所（ファイル名・行番号）
- 実際に確認した動作や期待との乖離
- 検証済みの仮説と反証された仮説

記載された証拠は後日 /plan-ticket が正確な計画を立てるための唯一の材料となる。
-->

## Test Plan

<!--
このチケットの実装を検証するためのユニットテスト計画を記載する。可能な限り網羅的なユニットテストを設計し、E2E テストに依存する範囲を最小化する。極限の網羅性でユニットテストを計画しておくことで、実装段階でほぼすべての不具合が発見・修正され、結果として E2E テストはほぼ成功すると考えられる状態を目指す。

- どの関数／モジュールに対してテストを書くか
- 正常系・異常系・境界値の各ケース
- モック・スタブが必要な外部依存
-->

## 計装方法・観測対象

<!--
Darvium は観測ベース検証（Observational Testing First）を基本とする。
このセクションでは計装と観測対象を定義する。

### 計装方法
- どのテストコードで計装を実装するか
- どのような計測プローブを仕掛けるか（println! + --nocapture 等）
- 固定シード PRNG（StdRng::seed_from_u64(12345)）を使用するか

### 観測対象
- 観測する統計量（平均・分散・エントロピー・分布形状等）
- サンプルサイズの要件（分布同定 n >= 10,000、ドリフト検出 n >= 1,000）
- 期待される現象（不変条件として assert すべき性質と、観測として記録すべき傾向）

### 較正計画
- 調整する定数（constants.rs の該当定数）
- 目的関数 J(θ) の設計（収束速度・定常誤差・オーバーシュート等の合成評価）
- 較正ループの停止条件
-->

## Boy Scout Rule — 翻訳可能性計画

<!--
このチケットで触るコードに対して、以下の観点で「来たときよりも美しく（翻訳可能に）」する計画を書く:

- 関数名/変数名が散文として読めるか
- 責務が混在している関数は分割すべきか
- ハードコード値を定数化すべきか
- コメントが「なぜ」を説明しているか
-->

## Acceptance Criteria

- [ ] 実装要件を満たしている
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストが通過している

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する
- observation_report_path: /start-ticket が observation-YYYYMMDD-HHmmss.md を作成後に frontmatter に最新パスを更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: ${contextDir}/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: ${contextDir}/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: ${contextDir}/review.md（未作成、/review-ticket 全チェック通過後に作成）
- 観察レポート: ${contextDir}/observation-YYYYMMDD-HHmmss.md（未作成、/start-ticket 観測テスト実行時に作成。繰り返し実行ごとに新規ファイル）
`;
}

/**
 * 新規 spec ファイルをテンプレートから生成する。
 * @param {string} filePath
 * @param {number} ticketId
 * @param {string} title
 * @param {string} slug
 * @param {string} [status='draft']
 * @returns {object} frontmatter
 */
function createSpecFile(filePath, ticketId, title, slug, status) {
  const now = today();
  const frontmatter = {
    ticket_id: ticketId,
    title,
    slug,
    status: status || "draft",
    created_at: now,
    updated_at: now,
  };
  const body = generateSpecBody(ticketId, title, slug);
  saveSpecFrontmatter(filePath, frontmatter, body);
  return frontmatter;
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  CFG,
  validateTicketId,
  formatTicketId,
  findNextTicketId,
  generateSlug,
  makeUniqueSlug,
  collectSlugs,
  resolveSpecPath,
  resolveAllPaths,
  parseFrontmatter,
  stringifyFrontmatter,
  readFrontmatterFromFile,
  writeFrontmatter,
  readField,
  writeField,
  updateFrontmatterFields,
  loadSpec,
  saveSpecFrontmatter,
  generateSpecBody,
  createSpecFile,
  parseQueueLine,
  generateQueueLine,
  parseQueueFile,
  addToQueue,
  updateQueueEntry,
  removeFromQueue,
  archiveExpiredEntries,
  validateStatus,
  validateTransition,
  getAllowedTransitions,
  formatDate,
  today,
};
