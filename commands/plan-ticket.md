---
description: 承認済みチケットの実装計画を策定する。物理的レビュー方法を計画に含め、ユーザーの承認を得る。引数なしならチケットIDを質問する。
---

# /plan-ticket

**役割**: `approved` チケットの実装計画と物理的レビュー方法の定義。

## ワークフローにおける位置づけ

このプロジェクトの作業の流れは `make → plan → start → review` である。ただし、各コマンドは必ずしも連続して実行されず、ユーザーの作業スタイルに応じて非連続的に使用される：

- **`/make-ticket`**: 複数のチケットをまとめて作成することが多い。作成後、すぐに計画・実装されるとは限らない。
- **`/plan-ticket` + `/start-ticket`**: ひとつのチケットに対して連続実行されることが多い（計画承認→即実装）。
- **`/review-ticket`**: 完了したチケットをまとめてレビューすることが多い。

**ルール**: 自分の役割を完了したら、必要に応じて次のアクションを提案してもよい（例：「実装を開始する場合は /start-ticket を実行してください」）。ただし、決定はユーザーに委ね、押し付けない。

## 引数の解釈

- 引数なし → ユーザーに「どのチケットの計画を策定しますか？」と質問する
- 数字 → チケットID

## 必須条件

チケットが `approved` ステータスであること。

## Boy Scout Rule

**翻訳可能性を損なっている既存コードを、スコープ内外問わず改善することを計画に含める。** 変更ファイル一覧とは別に「Boy Scout 改善（スコープ外の翻訳可能性修正）」セクションを設け、どのファイルの何を直すかを明記する。

### 翻訳可能性チェック（全言語共通、grep パターンは言語に応じて選択）

- 関数定義を grep し、名詞始まりの関数がないか
- 変数宣言を grep し、1文字変数や汎用名（`data`, `info`, `tmp`）がないか
- 4桁以上の数値リテラルが直接書かれていないか
- デバッグ出力が残っていないか

## 使用スクリプト一覧

`$_R/scripts/tickets/` 配下（全スクリプトの詳細は `scripts/tickets/README.md` を参照）：

| スクリプト | 引数 |
|---|---|
| `resolve-ticket.js` | `<id>` |
| `check-status.js` | `<id> <status>` |
| `read-frontmatter.js` | `<id>` |
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

### Step 1: 存在確認

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/resolve-ticket.js" "$ARGUMENTS"
```

`exists: false` → 終了。

### Step 2: approved 確認

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/check-status.js" "$ARGUMENTS" approved
```

`matches: false` → 現在のステータスを表示し「/make-ticket で先に承認を」と伝えて終了。

### Step 3: spec 読み取り

以下のコマンドで spec 全文と frontmatter を読み取る：

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/read-artifact.js" "$ARGUMENTS" spec
```

`created_at` と `updated_at` を確認し、make からどの程度時間が経過しているかを把握する。

### Step 4: 既存計画の確認

`read-artifact.js` で plan.md の有無を確認する：

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/read-artifact.js" "$ARGUMENTS" plan
```

- 出力がある場合 → 既存の計画が存在する。内容を踏まえて更新または再策定する。
- エラー終了（JSON エラーが出力される） → 新規に計画を策定する。

### Step 5: RFC 既存実装状態検証（新規: 必須ステップ）

**このステップは plan 策定の前提条件である。** 以下の手順を必ず実行し、結果を plan.md の先頭に記載する。検証を省略した計画は不完全とみなす。

#### 5a: 該当 RFC セクションの特定

spec に記載された「対象不変条件 / 規範」を手がかりに、RFC の該当セクション番号（例: §13.3、§13.6）を特定する。該当セクションが spec に明記されていない場合は、チケットタイトルと実装スコープから自力で特定し、欠落を spec に追記する。

#### 5b: RFC 型定義の抽出

該当 RFC セクションに定義された全 `struct` / `enum` / `trait` について、以下を抽出する：
- 型名
- フィールド名
- フィールドの型
- オプション性（必須 or 省略可）

#### 5c: 現行コードとの比較

抽出した型定義を現行ソースコードと 1 フィールド単位で比較し、以下の観点で評価する：

| 観点 | 判定基準 |
|------|---------|
| 完全一致 | フィールド名・型が RFC と同一 |
| 型不一致 | フィールド名は同じだが型が異なる（例: RFC u32 vs 実装 usize） |
| フィールド欠落 | RFC に定義されているフィールドが実装に存在しない |
| 余剰フィールド | 実装に存在するが RFC に定義がないフィールド |
| 型未定義 | 構造体そのものが未実装 |

比較結果は以下のテーブル形式で plan.md に記載する：

```markdown
## RFC 既存実装状態検証

### RFC §X.Y `SomeStruct`
| フィールド | RFC の型 | 現行コードの型 | 状態 |
|---|---|---|---|
| field_a | u32 | u32 | ✅ 一致 |
| field_b | u64 | u32 | ❌ 型不一致 |
| field_c | String | (欠落) | ❌ フィールド欠落 |
| field_d | (未定義) | bool | ⚠️ 余剰フィールド |

**評価サマリ**: 3/5 フィールドに乖離あり。実装前に修正が必要。
```

#### 5d: Investigation の更新

5c の発見を spec の Investigation セクションに追記する（古い情報はそのまま残し、「updated at plan time: YYYY-MM-DD」として追記）。

#### 5e: Investigation の再検証

spec 作成時から時間が経過している場合、当時記録された Investigation セクションの物理的証拠が現在のコードベースと一致しているとは限らない。以下の観点で再検証する：

- Investigation に記載されたファイルの該当行が現在も同じ内容か確認する
- 既に修正・改善されていたり、逆に新たな問題が発生していないか grep やテスト実行で確認する
- 検証結果に基づき、Investigation の情報を最新の状態に更新する

**計画は常に現在のコードベースの状態に基づいて策定しなければならない。**

### Step 6: 計画策定

spec 内容をもとに以下の構造で提示する：

- 要件の再確認
- 変更ファイル一覧（| ファイル | 種別 | 内容 |）
- Boy Scout 改善（スコープ外の翻訳可能性修正）
- 実装手順
- 物理的レビュー方法（`run-quality-checks.js` + 翻訳可能性 grep）
- リスク

### Step 7: ユーザー承認待ち

**明示的な承認を得るまで実装に入らない。**

### Step 8: 計画の保存

ユーザーの承認を得た後、計画内容を `save-artifact.js` にパイプして保存する。これによりファイル作成 + frontmatter 更新が一括処理される。

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
cat <<'PLAN_EOF' | node "$_R/scripts/tickets/save-artifact.js" "$ARGUMENTS" plan
# 計画内容をここに記述（要件、変更ファイル一覧、実装手順、レビュー方法、リスク）
PLAN_EOF
```

これにより、後でチケットを確認したときに「どのような計画で実装されたか」を追跡できる。
