---
description: Cross-check all completed tickets against RFC and ticket definitions.
---

# /verify-tickets

**役割**: 完了チケットの横断品質点検。`Darvium-Tickets-v2.3.md` の全完了チケットを対象に、成果物存在・RFC 交叉参照・定数/エラー型・テスト通過を一括検証する。

## `/review-ticket` との違い

| 観点 | `/review-ticket` | `/check-all` |
|------|-----------------|--------------|
| 対象 | 単一チケット | 全 ✅ チケット |
| 深さ | 詳細レビュー（コード品質・翻訳可能性・観測検証） | 横断チェック（成果物存在・RFC参照・定数/エラー型・テスト通過） |
| ステータス変更 | `done` → `reviewed` に遷移 | ステータス変更なし（読み取り専用） |
| 実行タイミング | 各チケット完了時 | マイルストーン完了時 / RFC改訂後 / リリース前 |

## 使用スクリプト一覧

`$_R/scripts/tickets/` 配下：

| スクリプト | 引数 | 説明 |
|---|---|---|
| `check-all/run-check-all.js` | （なし） | 全チェック実行本体 |

## ワークフロー

### Step 0: 初期化

```bash
if [ ! -f DARVIUM_PLUGIN_ROOT.md ]; then
  _R="$(node -e "process.stdout.write(process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude','plugins','marketplaces','ecc-darvium-marketplace'))")"
  echo "$_R" > DARVIUM_PLUGIN_ROOT.md
fi
```

### Step 1: 全チェック実行

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/check-all/run-check-all.js"
```

スクリプトは JSON レポートを stdout に出力する。末尾に以下のパース可能な行が stderr に含まれる：

```
CHECK-ALL-SUMMARY: passed=N warnings=N failed=N errors=N duration=Nms
```

### Step 2: AI によるレポート解釈表示

JSON レポートを読み、各チケットを以下の等級別に表示する：

- **`PASS`**: 全チェック通過 → チケット名と PASS 表示のみ
- **`WARN`**: 軽微な問題あり → 問題内容を列挙し、AI が修正を提案
- **`FAIL`**: 重大な問題 → 問題内容を列挙し、ユーザーに修正方針を相談
- **`ERROR`**: チケット読み取り不可 → ファイル不備を報告

表示例：

```
━━━ /check-all レポート ━━━

✓ PASS   M-2-1: RetrievalPrimitive 抽象インターフェース
✓ PASS   M-2-1.5: Dual-Store 抽象トレイト階層
⚠ WARN   M-2-2: SearchBudget (missing_observation)
✗ FAIL   M-2-3: Mock クライアント (missing_implementation, rfc_crossref_failed)

グローバルチェック:
✓ cargo test: 45 passed; 0 failed
✓ cargo clippy: passed
✓ cargo fmt: passed

翻訳可能性: 3 issues (major: 0, warning: 1, minor: 2)

サマリ: 11 total | 9 PASS | 2 WARN | 0 FAIL | 0 ERROR
```

### Step 3: レポート保存（オプション）

ファイルに保存する場合：

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/check-all/run-check-all.js" > check-all-report.json
```

保存後は AI が `check-all-report.json` を読み、上記 Step 2 と同様に解釈表示する。
