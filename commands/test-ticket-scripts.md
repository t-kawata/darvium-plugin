---
description: インストール先でチケット関連スクリプトの全テストを実行し、結果を報告する。引数は不要。
---

# /test-ticket-scripts

**役割**: チケットシステムの全スクリプトが正しく動作することをテストで検証する。

## 引数の解釈

- 引数は受け付けない。ARGUMENTS があっても無視する。

## ワークフロー

### Step 0: 初期化

```bash
if [ ! -f ECC_MYCUTE_PLUGIN_ROOT.md ]; then
  _R="$(node -e "process.stdout.write(process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude','plugins','marketplaces','ecc-mycute-marketplace'))")"
  echo "$_R" > ECC_MYCUTE_PLUGIN_ROOT.md
fi
```

### Step 1: テスト実行

```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
output=$(node "$_R/tests/tickets/lib-tickets.test.js" 2>&1)
exit_code=$?
summary=$(echo "$output" | tail -1)
```

### Step 2: 結果報告

`$summary`（`Passed: N / Failed: N`）と終了コードのみを報告する。終了コードが 0 なら「全テスト通過」、0 以外なら「テスト失敗」と伝える。個々のテスト結果は表示しない。
