---
description: 承認済みチケットの実装を実行する。ステータスを implementing に遷移させ、品質チェック通過後に done へ進める。引数なしならチケットIDを質問する。
---

# /start-ticket

**役割**: `approved` チケットの実装。

## ワークフローにおける位置づけ

このプロジェクトの作業の流れは `make → plan → start → review` である。ただし、各コマンドは必ずしも連続して実行されず、ユーザーの作業スタイルに応じて非連続的に使用される：

- **`/make-ticket`**: 複数のチケットをまとめて作成することが多い。作成後、すぐに計画・実装されるとは限らない。
- **`/plan-ticket` + `/start-ticket`**: ひとつのチケットに対して連続実行されることが多い（計画承認→即実装）。
- **`/review-ticket`**: 完了したチケットをまとめてレビューすることが多い。

**ルール**: 自分の役割を完了したら、必要に応じて次のアクションを提案してもよい（例：「品質レビューを行う場合は /review-ticket を実行してください」）。ただし、決定はユーザーに委ね、押し付けない。

## 引数の解釈

- 引数なし → ユーザーに「どのチケットを実装しますか？」と質問する
- 数字 → チケットID

## 必須条件

チケットが `approved` ステータスであること。

## Boy Scout Rule

実装中に翻訳可能性を損なっている既存コードを見つけたら、スコープ外でも積極的に直す：エラー握りつぶし→伝播、ハードコード値→定数化、汎用変数名→ドメイン名、複数責務関数→分割。**計画に含まれていなくても実施する。**

## 使用スクリプト一覧

`$_R/scripts/tickets/` 配下（全スクリプトの詳細は `scripts/tickets/README.md` を参照）：

| スクリプト | 引数 |
|---|---|
| `resolve-ticket.js` | `<id>` |
| `check-status.js` | `<id> <status>` |
| `update-ticket-status.js` | `<id> <status>` |
| `review/run-quality-checks.js` | `<files...>` |
| `review/generate-report.js` | （stdin経由） |
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

### Step 1: 存在確認 + approved 確認

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/resolve-ticket.js" "$ARGUMENTS"
```

`exists` が false なら終了。存在すれば status を確認：

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/check-status.js" "$ARGUMENTS" approved
```

`matches` が false なら「このチケットは <currentStatus> です。/plan-ticket で先に計画を策定し承認を受けてください」と伝えて終了。

### Step 2: implementing に遷移

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/update-ticket-status.js" "$ARGUMENTS" implementing
```

### Step 3: spec + plan 読み取り

`read-artifact.js` で spec 全文と plan.md を機械的に読み取る：

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/read-artifact.js" "$ARGUMENTS" spec
```

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/read-artifact.js" "$ARGUMENTS" plan
```

### Step 4a: 計装コードの実装

spec の「計装方法・観測対象」に従い、以下の2種類のテストコードを実装する：

1. **不変条件テスト**（`assert!` / `assert_eq!` で記述）
   - DAG 性、状態遷移正当性、境界値超過の検出
   - 通常の `cargo test` で PASS/FAIL を判定

2. **観測テスト**（`println!` + `--nocapture` で記述）
   - 統計量の集計と構造化出力（JSON/CSV/ヒストグラム）
   - 固定シード PRNG（`StdRng::seed_from_u64(12345)`）
   - サンプルサイズ: 分布同定 n >= 10,000、ドリフト検出 n >= 1,000
   - 観測テスト自体は常に PASS するが、その出力が分析対象となる

spec の「計装方法・観測対象」セクションが存在しない場合：

```
⚠️ 警告: spec に「計装方法・観測対象」が定義されていません。
観測ベース検証をスキップして通常の実装を続行します。
```

### Step 4b: 較正ループの実行

以下のサイクルを**最低1回**実行する：

```text
[仮説] → [constants.rs 変更] → [cargo test] → [観測] → [解釈] → [記録]
```

各反復で以下を記録する：
- 仮説（「TRUST_INHERIT_DECAY を 0.70→0.80 に増加すると収束時間が 20% 短縮される」等）
- 変更した定数名と変更前後の値
- 観測された統計量の変化
- 日本語による定性的解釈（数式に過度に依存せず、現象を言葉で説明する）

### Step 4c: 観測テストの実行

```bash
# 不変条件テスト
cargo test

# 観測テスト（出力を確認）
cargo test -- --nocapture
```

### Step 4d: 観察レポートの保存

観測テスト実行後、以下のテンプレートに従って観察レポートを保存する：

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
cat <<'OBSERVE_EOF' | node "$_R/scripts/tickets/save-artifact.js" "$ARGUMENTS" observation
# 観察レポート: <チケットタイトル>

## 1. 計装の実装状況

- 計装対象: <spec の「計装方法・観測対象」から引用>
- 実装したテストコード: <ファイル名>
- 観測した統計量: <平均・分散・エントロピー・分布形状等>

## 2. 観測テスト実行結果

```
<--nocapture 出力>
```

## 3. 較正ループ

### 反復 1
- 仮説: 
- 変更定数: 
- 観測結果: 
- 解釈: 

### 反復 2（該当する場合）
...

## 4. 現象の解釈（日本語）

<実験で観察された現象を、数式に過度に依存せず、言葉でわかりやすく記述する>

## 5. 目的関数 J(θ) の評価

- 収束速度:
- 定常誤差:
- オーバーシュート:
- 総合評価:

## 6. 次チケットへの示唆

<後続チケットに伝えるべき知見>
OBSERVE_EOF
```

### Step 4e: 観察レポート保存確認

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/read-artifact.js" "$ARGUMENTS" observation
```

エラー終了した場合 → 観察レポート未保存。Step 4d に戻って保存してから続行する。

**観察レポートは `done` 遷移の必須条件である。** 保存されていない場合、後続の「done に遷移」ステップに進めず、メッセージを表示して差し戻す。

### Step 5: 品質チェック

実装後、変更ファイルを列挙して実行する：

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/review/run-quality-checks.js" src/file1.rs src/file2.rs
```

パイプでレポートを生成：

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/review/run-quality-checks.js" src/file1.rs | node "$_R/scripts/tickets/review/generate-report.js"
```

### Step 6: 実装成果の保存

品質チェック通過後、実装内容のサマリーを `save-artifact.js` にパイプして保存する：

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
cat <<'IMPL_EOF' | node "$_R/scripts/tickets/save-artifact.js" "$ARGUMENTS" implementation
# 変更したファイル一覧と実装内容の概要
IMPL_EOF
```

これにより、後でチケットを確認したときに「どのように実装されたか」を追跡できる。

### Step 7: done に遷移

観察レポート（observation）が保存されていることを確認する：

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/read-artifact.js" "$ARGUMENTS" observation
```

エラー終了する場合 → 観察レポート未保存。Step 4d に戻り、計装・観測・較正ループを実行してから観察レポートを保存する。

観察レポート確認後、品質チェック通過：

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/update-ticket-status.js" "$ARGUMENTS" done
```

品質問題がある場合は修正してから `done` にする。やむを得ない中断時は `approved` に戻す。
