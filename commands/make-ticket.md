---
description: チケットを作成する。引数なしなら詳細をヒアリングしてAIがタイトルを決定、数字なら深掘り、数字以外ならそのままタイトルとして作成。
---

# /make-ticket

**役割**: チケットの作成と詳細化。

## ワークフローにおける位置づけ

このプロジェクトの作業の流れは `make → plan → start → review` である。ただし、各コマンドは必ずしも連続して実行されず、ユーザーの作業スタイルに応じて非連続的に使用される：

- **`/make-ticket`**: 複数のチケットをまとめて作成することが多い。作成後、すぐに計画・実装されるとは限らない。
- **`/plan-ticket` + `/start-ticket`**: ひとつのチケットに対して連続実行されることが多い（計画承認→即実装）。
- **`/review-ticket`**: 完了したチケットをまとめてレビューすることが多い。

**ルール**: 自分の役割を完了したら、必要に応じて次のアクションを提案してもよい（例：「次に計画を策定する場合は /plan-ticket を実行してください」）。ただし、決定はユーザーに委ね、押し付けない。

## 引数の解釈

- 引数なし → 実装したい内容を詳しくユーザーにヒアリングし、それに基づいてAIが適切なタイトルを決定する
- 数字 → 既存チケットIDとして深掘り
- 数字以外 → 新規チケットのタイトルとして作成

## Boy Scout Rule

新規作成時、spec の「Boy Scout Rule — 翻訳可能性計画」セクションに以下を必ず含める：関数名は動詞句、変数名はドメイン概念、一関数一責務、ハードコード値は名前付き定数、エラー握りつぶし禁止。**スコープ内外問わず、翻訳可能性を損なう既存コードを積極的に改善する計画を記載する。**

## 使用スクリプト一覧

`$_R/scripts/tickets/` 配下。`$_R` は `ECC_MYCUTE_PLUGIN_ROOT.md` から読み取る（初回は Step 0 で自動生成）。全スクリプトの詳細は `scripts/tickets/README.md` を参照。

| スクリプト | 引数 |
|---|---|
| `create-ticket.js` | `"" <title>` |
| `resolve-ticket.js` | `<id>` |
| `read-frontmatter.js` | `<id>` |
| `update-frontmatter.js` | `<id> <key> <val>` |
| `list-tickets.js` | `[status]` |
| `count-tickets.js` | （なし） |

## ワークフロー

### 初期化

```bash
if [ ! -f ECC_MYCUTE_PLUGIN_ROOT.md ]; then
  _R="$(node -e "process.stdout.write(process.env.CLAUDE_PLUGIN_ROOT||require('path').join(require('os').homedir(),'.claude','plugins','marketplaces','ecc-mycute-marketplace'))")"
  echo "$_R" > ECC_MYCUTE_PLUGIN_ROOT.md
fi
```

### 新規作成

$ARGUMENTS が空なら、何を実装したいのか詳しくユーザーにヒアリングする（目的、背景、期待する動作など）。得られた情報をもとにAIが適切なタイトルを決めてから実行する。

```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/create-ticket.js" "" "タイトル"
```

出力の `ticketId`, `specPath` を保持する。その後、以下の手順でチケットを具体化する：

1. **ソースコード調査**: 問題の原因や実装に必要な情報を、ソースコードの解析、grep、調査解析、解析調査用テストコードの作成、テスト実行、ログ確認などを通じて調査する。エラーメッセージやスタックトレースなど**物理的な証拠**を収集する。
2. **証拠の記録**: 調査で得られた証拠（エラー箇所のファイル名・行番号、実際の出力、再現手順など）を spec ファイルの `## Investigation` セクションに書き込む。
3. **仕様の具体化**: 証拠に基づいて Background / Scope / Test Plan / Acceptance Criteria をユーザーと対話しながら具体化する。Test Plan には**可能な限り網羅的なユニットテストの計画**を記載する。極限の網羅性でユニットテストを設計しておくことで、実装段階でほぼすべての不具合が発見・修正され、結果として E2E テストはほぼ成功すると考えられる状態を目指す。「ユニットテストでカバーできる範囲は全てユニットテストで検証する」という方針に基づき、E2E テストに依存する範囲を最小化する。

調査結果の書き込みと仕様の具体化が完了したら、ユーザーに内容を提示して確認を求める。

### 深掘り

```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/resolve-ticket.js" "42"
```

`exists: false` なら終了。存在すれば `read-frontmatter.js` で内容を取得し、不足セクションを補完する。

```bash
_R=$(cat ECC_MYCUTE_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/read-frontmatter.js" "42"
```
