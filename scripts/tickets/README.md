# スクリプトリファレンス — `scripts/tickets/`

この文書は、`scripts/tickets/` 配下の全スクリプトを網羅する。AI は各コマンドの実行中に必要に応じてこの文書を参照し、適切なスクリプトを選択・実行すること。

## スクリプトの実行方法

すべてのスクリプトは `$_R/scripts/tickets/` に配置されている。`$_R` の取得方法は以下の通り：

```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/<script-name>.js" "<args>"
```

`ECC_MYCUTE_PLUGIN_ROOT.md` が存在しない場合は、各コマンドファイルの Step 0（初期化）を先に実行することで自動生成される。

## 出力形式

全スクリプトは JSON を stdout に出力する。成功時は `{ "success": true, ... }`、失敗時は `{ "success": false, "error": "..." }` の形式。

---

## カテゴリ別スクリプト一覧

### ライフサイクル（4 コマンドから使用）

| # | スクリプト | コマンド | 用途 |
|---|-----------|---------|------|
| 1 | `create-ticket.js` | `/make-ticket` | 新規チケット作成 |
| 2 | `resolve-ticket.js` | 全コマンド | チケットID から spec パス・ステータス等を解決 |
| 3 | `read-frontmatter.js` | `/make-ticket`, `/plan-ticket` | フロントマター読み取り |
| 4 | `update-frontmatter.js` | `/make-ticket` | フロントマター更新 |
| 5 | `check-status.js` | `/plan-ticket`, `/start-ticket` | ステータス確認 |
| 6 | `update-ticket-status.js` | `/start-ticket`, `/review-ticket` | ステータス遷移 |
| 7 | `list-tickets.js` | `/make-ticket` | チケット一覧 |
| 8 | `count-tickets.js` | `/make-ticket` | チケット件数 |
| 9 | `validate-structure.js` | `/review-ticket` | 構造整合性検証 |
| 10 | `review/run-quality-checks.js` | 各コマンド | 静的品質分析 |
| 11 | `review/generate-report.js` | 各コマンド | 品質レポート生成 |

### ユーティリティ（必要時に AI が判断して使用）

| # | スクリプト | 用途 |
|---|-----------|------|
| 12 | `search-tickets.js` | キーワード検索 |
| 13 | `find-by-slug.js` | スラッグ検索 |
| 14 | `delete-ticket.js` | チケット削除（復元不可） |
| 15 | `backup-ticket.js` | チケットバックアップ |
| 16 | `restore-ticket.js` | チケット復元 |
| 17 | `create-draft.js` | 下書き作成 |
| 18 | `promote-draft.js` | 下書き → spec 昇格 |
| 19 | `ensure-ticket-structure.js` | ディレクトリ構造初期化 |
| 20 | `resync-queue.js` | キュー再同期 |

---

## ライフサイクルスクリプト

### 1. `create-ticket.js`

**用途**: 新規チケットを作成する。チケットID は自動採番（空文字列を渡す）か明示指定可能。spec ファイルとコンテキストディレクトリを作成し、キューに追加する。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | `""`（空文字列）または数値 | 実質必須 | 空文字列で自動採番、数値で指定 ID |
| 3 | タイトル文字列 | 必須 | チケットのタイトル |
| 4 | ステータス（省略時 `draft`） | 任意 | 初期ステータス |

stdin からの JSON 入力にも対応（`{ "title": "...", "status": "..." }`）。

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/create-ticket.js" "" "ユーザー認証の実装"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "title": "ユーザー認証の実装", "slug": "user-auth", "status": "draft", "specPath": "...", "contextDir": "..." }
```

**いつ使うか**: ユーザーからの新規チケット作成依頼時。`/make-ticket` コマンドの新規作成フローで使用する。

---

### 2. `resolve-ticket.js`

**用途**: チケットID から spec ファイルのパスやステータス、スラッグなどのメタデータを解決する。指定された ID のチケットが存在するかの確認にも使う。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 解決したいチケットの ID |

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/resolve-ticket.js" "5"
```

**出力**:
```json
{ "success": true, "exists": true, "ticketId": 5, "title": "ユーザー認証の実装", "slug": "user-auth", "status": "approved", "specPath": "/path/to/0005-user-auth.md", "contextDir": "/path/to/0005-user-auth/" }
```

**いつ使うか**: 任意の処理の最初のステップとして、チケットの存在確認とメタデータ取得のために使用する。`exists` が `false` なら該当チケットなし。

---

### 3. `read-frontmatter.js`

**用途**: チケットの spec ファイルから YAML フロントマターを読み取る。特定フィールドのみの取得も可能。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 読み取り対象のチケット |
| 3 | フィールド名（省略時は全フィールド） | 任意 | 特定フィールドのみ取得 |

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/read-frontmatter.js" "5"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "attrs": { "ticket_id": 5, "title": "ユーザー認証の実装", "slug": "user-auth", "status": "approved", "created_at": "2026-05-16", "updated_at": "2026-05-16", "background": "...", "scope": "...", "boy_scout_rule": "...", "acceptance_criteria": "..." } }
```

**いつ使うか**: spec のメタデータ（ステータス、タイトル、スコープ等）を確認したいとき。`/plan-ticket` での spec 内容確認、`/make-ticket` での深掘り時に使用する。

---

### 4. `update-frontmatter.js`

**用途**: チケットの spec ファイルのフロントマターにある特定フィールドの値を更新する。**1 回の呼び出しで 1 フィールドのみ。**

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 更新対象のチケット |
| 3 | フィールド名（キー） | 必須 | 例: `title`, `background`, `scope` |
| 4 | 新しい値 | 必須 | フィールドに設定する値 |

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/update-frontmatter.js" "5" "status" "approved"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "field": "status", "value": "approved" }
```

**いつ使うか**: チケットのメタデータを直接編集したいとき。通常は `update-ticket-status.js` でステータス変更を行うが、それ以外のフィールド（タイトル、背景、スコープ等）の更新に使用する。

---

### 5. `check-status.js`

**用途**: チケットが特定のステータスであるかどうかを確認する。ガード条件として使用する。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 確認対象のチケット |
| 3 | 期待するステータス | 必須 | `draft`, `reviewing`, `approved`, `implementing`, `done`, `reviewed`, `blocked` |

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/check-status.js" "5" "approved"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "currentStatus": "approved", "expectedStatus": "approved", "matches": true }
```

**いつ使うか**: 処理の前提条件として、チケットが正しいステータスにあることを確認する。`matches` が `false` なら後続処理を実行せずユーザーに報告する。

---

### 6. `update-ticket-status.js`

**用途**: チケットのステータスを別のステータスに遷移させる。不正な遷移はエラーになる。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 更新対象のチケット |
| 3 | 新しいステータス | 必須 | `draft`, `reviewing`, `approved`, `implementing`, `done`, `reviewed`, `blocked` |

**許可される遷移**:
- `draft` → `reviewing`
- `reviewing` → `approved`, `blocked`
- `approved` → `implementing`, `blocked`
- `implementing` → `done`, `approved`（中断時）, `blocked`
- `blocked` → 任意のステータス
- `done` → `reviewed`, `implementing`（差し戻し）
- `reviewed` → 遷移不可（終端）

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/update-ticket-status.js" "5" "implementing"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "from": "approved", "to": "implementing", "transitionAllowed": true }
```

**いつ使うか**: チケットのライフサイクルを進めるとき。`/start-ticket` では `approved` → `implementing`、`/review-ticket` では `done` → `reviewed` の遷移に使用する。

---

### 7. `list-tickets.js`

**用途**: 全チケットを一覧表示する。特定のステータスでフィルタリング可能。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | ステータス（省略時は全件） | 任意 | `draft`, `reviewing`, `approved`, `implementing`, `done`, `reviewed`, `blocked` |

**使用例**:
```bash
# 全チケット表示
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/list-tickets.js"

# approved のチケットのみ表示
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/list-tickets.js" "approved"
```

**出力**:
```json
{ "success": true, "count": 3, "tickets": [{ "ticketId": 1, "title": "...", "slug": "...", "status": "draft" }, ...] }
```

**いつ使うか**: 現在のチケット状況を俯瞰したいとき。例えば「承認済みのチケットはどれですか？」と聞かれた場合に `list-tickets.js "approved"` を実行する。

---

### 8. `count-tickets.js`

**用途**: ステータス別のチケット件数を集計する。

**引数**: なし

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/count-tickets.js"
```

**出力**:
```json
{ "success": true, "total": 12, "counts": { "draft": 3, "reviewing": 2, "approved": 4, "implementing": 1, "done": 2, "blocked": 0 } }
```

**いつ使うか**: チケット全体の進捗状況を簡潔に把握したいとき。

---

### 9. `validate-structure.js`

**用途**: 全チケットの spec ファイルの構造整合性を検証する。必須フィールドの欠落、重複 ID、不正なステータス、キューと実ファイルの不整合などを検出する。

**引数**: なし

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/validate-structure.js"
```

**出力（正常時）**:
```json
{ "success": true, "valid": true, "issuesCount": 0, "issues": [] }
```

**出力（不整合時）**:
```json
{ "success": true, "valid": false, "issuesCount": 2, "issues": [{ "type": "missing_field", "file": "0003-task.md", "detail": "..." }, { "type": "orphan_queue_entry", "detail": "..." }] }
```

**いつ使うか**: `/review-ticket` での品質チェックの一環、または何らかの不整合が疑われる場合に任意で実行する。

---

### 10. `review/run-quality-checks.js`

**用途**: 指定されたソースファイルに対して静的品質チェックを実行する。対象言語: `.rs`, `.js`, `.ts`, `.tsx`, `.jsx`, `.vue`, `.go`。

**チェック項目**:

| チェック | 重大度 | 検出対象 |
|---------|--------|---------|
| `unwrap()` / `expect()` | major | エラー握りつぶし |
| 1 文字変数名 | minor | 翻訳可能性を損なう命名 |
| ハードコードされたポート番号 | major | 設定値の直接埋め込み |
| TODO / FIXME / HACK / XXX | minor | 未完了タスク |
| コメントアウトされたコード | minor | デッドコードの放置 |
| デバッグ出力 | major | `console.log`, `println!` 等 |
| unsafe ブロック（Rust） | major | 安全でない操作 |
| 空の catch / else ブロック | major | エラー握りつぶし |
| 多パラメータ関数 | minor | 関数の責務過多 |

**引数**: 検査対象のファイルパス（1 つ以上）

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/review/run-quality-checks.js" src/main.rs src/lib.rs
```

**出力**:
```json
{ "success": true, "totalIssues": 3, "checks": { "findUnwrap": { "label": "unwrap() / expect() usage", "severity": "major", "findings": [{ "line": 42, "match": ".unwrap()", "file": "src/main.rs" }] }, ... } }
```

**いつ使うか**: 実装後またはレビュー時に、変更ファイルの品質を自動検証する。`generate-report.js` にパイプして可読性の高いレポートを生成してからユーザーに提示すること。

---

### 11. `review/generate-report.js`

**用途**: `run-quality-checks.js` の JSON 出力を入力として受け取り、Markdown レポートを生成する。

**引数**: なし（stdin から JSON を読み取る）

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/review/run-quality-checks.js" src/main.rs | node "$_R/scripts/tickets/review/generate-report.js"
```

**出力**: Markdown 文字列（stdout）
```markdown
# Quality Check Report

**Total issues found: 3**

## Major Issues

### unwrap() / expect() usage

- `src/main.rs:42` — .unwrap()
```

**いつ使うか**: `run-quality-checks.js` の出力をユーザーに提示する前に、常にこのスクリプトに通す。可読性が大幅に向上する。

---

## ユーティリティスクリプト

### 12. `search-tickets.js`

**用途**: キーワードでチケットを検索する。チケットID、タイトル、スラッグに対して部分一致検索を行う。ステータスによるフィルタリングも可能。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | キーワード | 必須 | 検索文字列（大文字小文字を区別しない） |
| 3 | ステータス（省略時は全ステータス） | 任意 | 特定ステータスのみに絞り込む |

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/search-tickets.js" "認証"

# approved のチケットから "api" を検索
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/search-tickets.js" "api" "approved"
```

**出力**:
```json
{ "success": true, "keyword": "認証", "count": 2, "tickets": [{ "ticketId": 5, "title": "ユーザー認証の実装", "slug": "user-auth", "status": "approved" }, ...] }
```

**いつ使うか**: チケット名を覚えていないが内容の一部を覚えている場合や、特定のテーマに関連するチケットを探したいとき。

---

### 13. `find-by-slug.js`

**用途**: スラッグ（URL-friendly な識別子）でチケットを検索する。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | スラッグ文字列 | 必須 | 例: `user-auth` |

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/find-by-slug.js" "user-auth"
```

**出力**:
```json
{ "success": true, "found": true, "ticketId": 5, "title": "ユーザー認証の実装", "slug": "user-auth", "status": "approved" }
```

**いつ使うか**: ファイル名や URL からスラッグが判明している場合に、対応するチケットを特定する。

---

### 14. `delete-ticket.js`

**用途**: チケットを完全に削除する。spec ファイル、コンテキストディレクトリ、下書きファイル、キューエントリのすべてを削除する。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 削除対象のチケット |

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/delete-ticket.js" "5"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "deleted": ["/path/to/0005-user-auth.md", "/path/to/0005-user-auth/"], "queueCleaned": true }
```

**いつ使うか**: 誤作成したチケットを完全に消去するとき。**削除前にユーザーの明示的な確認を取ること。**

---

### 15. `backup-ticket.js`

**用途**: チケットの spec ファイルをバックアップディレクトリにコピーする。タイムスタンプ付きで保存される。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | バックアップ対象のチケット |

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/backup-ticket.js" "5"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "backupPath": "/path/to/backups/0005-2026-05-16-1234567890.md" }
```

**いつ使うか**: 重要な変更（ステータス遷移、内容の大幅な編集）を行う前に、安全のためバックアップを取っておきたいとき。複数回実行するとバックアップが蓄積される。

---

### 16. `restore-ticket.js`

**用途**: バックアップからチケットを復元する。最新のバックアップが使用される。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 復元対象のチケット |

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/restore-ticket.js" "5"
```

**出力**:
```json
{ "success": true, "ticketId": 5, "restoredFrom": "/path/to/backups/0005-2026-05-16-1234567890.md", "specPath": "/path/to/0005-user-auth.md" }
```

**いつ使うか**: 誤ってチケットを編集してしまい、バックアップ時点の状態に戻したいとき。復元前に現在の状態のバックアップを取ることを検討する。

---

### 17. `create-draft.js`

**用途**: 下書きチケットを作成する。`create-ticket.js` と異なり、最小限の情報で下書きファイルを `drafts/` ディレクトリに作成する。spec ファイルやキューエントリは作成しない。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 作成するチケットの ID |
| 3 | タイトル（省略時は自動生成） | 任意 | チケットのタイトル |

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/create-draft.js" "42" "新機能の検討"
```

**出力**:
```json
{ "success": true, "ticketId": 42, "title": "新機能の検討", "slug": "new-feature", "draftPath": "/path/to/drafts/0042-new-feature.md" }
```

**いつ使うか**: チケットの内容がまだ具体化しておらず、正式な spec として作成する前の下書き段階で保存したいとき。

---

### 18. `promote-draft.js`

**用途**: 下書きチケットを正式な spec に昇格させる。下書きから情報を読み取り、spec ファイルを作成し、キューに追加する。

**引数**:

| argv | 値 | 必須 | 説明 |
|------|-----|------|------|
| 2 | 数値（チケットID） | 必須 | 昇格させるチケットの ID |

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/promote-draft.js" "42"
```

**出力**:
```json
{ "success": true, "ticketId": 42, "title": "新機能の検討", "slug": "new-feature", "specPath": "/path/to/0042-new-feature.md", "draftPath": "/path/to/drafts/0042-new-feature.md" }
```

**いつ使うか**: 下書きが十分に具体化され、正式なチケットとして管理したいとき。

---

### 19. `ensure-ticket-structure.js`

**用途**: チケット管理に必要なディレクトリ構造（specs、contexts、drafts、queue ファイル）が存在することを確認し、不足があれば作成する。

**引数**: なし

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/ensure-ticket-structure.js"
```

**出力**:
```json
{ "success": true, "created": ["specs/", "contexts/", "drafts/", "queue.tasks"], "existed": [] }
```

**いつ使うか**: プラグインのセットアップ時または不整合が疑われるときに実行する。通常は初回チケット作成時に自動的に構造が作られるため、明示的に実行する必要はほとんどない。

---

### 20. `resync-queue.js`

**用途**: キュー定義ファイル（`queue.tasks`）をディスク上の実ファイル一覧から再生成する。手動でファイルを追加・削除した場合などの不整合を修復する。

**引数**: なし

**使用例**:
```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/resync-queue.js"
```

**出力**:
```json
{ "success": true, "count": 12, "queuePath": "/path/to/queue.tasks" }
```

**いつ使うか**: キューと実ファイルの間に不整合が発生した場合。`validate-structure.js` で `orphan_queue_entry` や `missing_queue_entry` が報告されたときに修復手段として実行する。
