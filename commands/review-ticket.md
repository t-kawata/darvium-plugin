---
description: 実装済みチケットの品質レビュー。/plan-ticket で定義された全レビュー方法を再実行し、品質通過後に reviewed へ遷移する。引数なしならチケットIDを質問する。
---

# /review-ticket

**役割**: `done` チケットの品質検証。`/plan-ticket` のレビュー方法を全て再実行する。

## ワークフローにおける位置づけ

このプロジェクトの作業の流れは `make → plan → start → review` である。ただし、各コマンドは必ずしも連続して実行されず、ユーザーの作業スタイルに応じて非連続的に使用される：

- **`/make-ticket`**: 複数のチケットをまとめて作成することが多い。作成後、すぐに計画・実装されるとは限らない。
- **`/plan-ticket` + `/start-ticket`**: ひとつのチケットに対して連続実行されることが多い（計画承認→即実装）。
- **`/review-ticket`**: 完了したチケットをまとめてレビューすることが多い。

**ルール**: 自分の役割を完了したら、必要に応じて次のアクションを提案してもよい。ただし、決定はユーザーに委ね、押し付けない。

## 引数の解釈

- 引数なし → ユーザーに「どのチケットをレビューしますか？」と質問する
- 数字 → チケットID

## Boy Scout Rule — レビュー観点

**実装者が既存コードの改善を行ったか検証する。** 新コードの品質だけでなく、既存コードに対する改善痕跡（エラー伝播への修正、定数化、関数分割等）も確認する。翻訳可能性チェック（grep パターンは言語に応じて選択）：

- 関数定義を grep し、動詞句でない関数名がないか
- 変数宣言を grep し、1文字変数や汎用名が新たに追加されていないか
- マジックナンバーが直接書かれていないか
- デバッグ出力が残っていないか
- コメントは「なぜ」のみか（「何を」はコード自身が語るべき）

## 使用スクリプト一覧

`$_R/scripts/tickets/` 配下（全スクリプトの詳細は `scripts/tickets/README.md` を参照）：

| スクリプト | 引数 |
|---|---|
| `resolve-ticket.js` | `<id>` |
| `check-status.js` | `<id> <status>` |
| `update-ticket-status.js` | `<id> <status>` |
| `review/run-quality-checks.js` | `<files...>` |
| `review/generate-report.js` | （stdin経由） |
| `validate-structure.js` | （なし） |
| `update-frontmatter.js` | `<id> <key> <val>` |
| `read-artifact.js` | `<id> <type>` |
| `save-artifact.js` | `<id> <type>`（stdin） |

## ワークフロー

### Step 0: 初期化

```bash
if [ ! -f DARVIUM_PLUGIN_ROOT.md ]; then
  _R="$(node -e "process.stdout.write(process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude','plugins','marketplaces','ecc-darvium-marketplace'))")"
  echo "$_R" > DARVIUM_PLUGIN_ROOT.md
fi
```

### Step 1: 存在確認 + done 確認

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/resolve-ticket.js" "$ARGUMENTS"
```

`exists` が false なら終了。存在すれば status を確認：

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/check-status.js" "$ARGUMENTS" done
```

`matches` が false なら「このチケットはまだ実装完了（done）していません。先に /start-ticket で実装を完了してください」と伝えて終了。

### Step 2: spec + implementation 読み取り

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/read-artifact.js" "$ARGUMENTS" spec
```

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/read-artifact.js" "$ARGUMENTS" implementation
```

spec の Acceptance Criteria と実装サマリを確認する。

### Step 3: チケット仕様交叉参照

**Darvium-Tickets-v2.3.md** から該当チケットの仕様を読み取り、実装に漏れや矛盾がないかを丁寧に点検する。

```bash
# Darvium-Tickets-v2.3.md から当該フェーズ・チケットを抽出
grep -A 50 "^### Phase.*M-[0-9]" "$DARVIUM_ROOT/Darvium-Tickets-v2.3.md" | head -100
```

確認観点：
- Acceptance Criteria が全て実装されているか
- テスト仕様（観測テスト・不変条件テスト）が全て書かれているか
- 仕様に記載された型・定数・関数が実装と一致しているか
- 見落としや「後でやる」が残っていないか
- Tickets と実装の間に不整合がないか

### Step 4: RFC 理論交叉参照

**Darvium-RFC-0001-Unified-v2.3-final.md** を読み返し、実装が全体の理論体系に対して矛盾・不足・衝突の可能性なく安全であるかを点検する。

```bash
# RFC の該当セクションを読み取り
head -n 300 "$DARVIUM_ROOT/Darvium-RFC-0001-Unified-v2.3-final.md"
```

確認観点：
- 実装が RFC の理論（数式・アルゴリズム・アーキテクチャ）と矛盾していないか
- Safety Invariant（不変条件）が全て守られているか
- エラー型が RFC Annex B の定義と一致しているか
- 定数値が RFC の規定値と一致しているか
- アーキテクチャ上の衝突（層間の責務混入、依存の逆転等）がないか
- 本来あるべき状態遷移・ライフサイクルが欠落していないか

### Step 5: 静的品質チェック

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/review/run-quality-checks.js" src/file1.rs src/file2.rs | node "$_R/scripts/tickets/review/generate-report.js"
```

### Step 6: 構造整合性チェック

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/validate-structure.js"
```

出力の `valid` が false なら issues を修正してから続行。

### Step 7: 翻訳可能性チェック

`/plan-ticket` で定義された grep コマンドを全て再実行する。

### Step 8: レビュー報告書の保存

全チェック通過後、レビュー結果を `save-artifact.js` にパイプして保存する：

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
cat <<'REVIEW_EOF' | node "$_R/scripts/tickets/save-artifact.js" "$ARGUMENTS" review
# 各チェックの結果（静的品質チェック、構造整合性チェック、翻訳可能性チェックの結果と合否、見つかった問題と修正内容）
REVIEW_EOF
```

これにより、後でチケットを確認したときに「どのようにレビューされ、品質が担保されているか」を追跡できる。

### Step 9: reviewed に遷移

全チェック通過後：

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/update-ticket-status.js" "$ARGUMENTS" reviewed
```

## 不通過時の判断

- **軽微**: AI がその場で修正し再チェック
- **重大**: ユーザーに報告して修正方針を相談。差し戻しが必要な場合は implementing に戻す：

  ```bash
  _R=$(cat DARVIUM_PLUGIN_ROOT.md)
  node "$_R/scripts/tickets/update-ticket-status.js" "$ARGUMENTS" implementing
  ```
