---
description: "Darvium-Tickets-v2.3.md 現時点の完了済みチケット（✅）のみを対象に、テスト実験・較正ループを含めて全てやり直し、RFC に対して矛盾と不足がないか深層検査し、不十分な点を是正する。未完了チケットのスコープには一切手を出さない。引数不要。"
---

# /check-all

**役割**: 完了チケットの横断深層検証＋是正。`Darvium-Tickets-v2.3.md` の全 ✅ チケットを対象に、テストコード実験・較正ループを含めた完全なやり直しを行い、RFC との無矛盾を検証し、不足・矛盾を積極的に修正する。

## スコープ定義（最も重要なルール）

**検査対象は「現時点で完了済みのチケット（✅）」のみである。** 以下のルールを厳守すること：

1. **先走りの禁止**: Darvium-Tickets-v2.3.md 内の未完了チケット（✅ 以外）で予定されている型・関数・テスト・定数・エラー型を、この検査の中で新規に実装してはならない。Darvium-Tickets-v2.3.md の先のセクションを読むのは RFC 参照解決のためだけに留め、その内容を作業対象と解釈してはならない。

2. **是正範囲の制限**: Phase 2 で修正・追加できるのは、あくまで完了済みチケットの spec Scope（実装スコープ）および Test Plan に明記されている範囲のみである。完了済みチケットの spec に記載のない型・関数・テストを「必要そうだから」という理由で追加してはならない。

3. **RFC と spec の間に解離がある場合**: RFC に記載があるが、どの完了チケットの spec にもその実装が割り当てられていない項目は、将来のチケットのスコープとみなし、実装してはならない。矛盾点としてレポートに記録するのみに留める。

4. **判断保留**: ある欠落が完了済みチケットのスコープなのか将来チケットのスコープなのか判断できない場合は、ユーザーに確認してから行動する。勝手に判断して実装してはならない。

## `/review-ticket` との違い

| 観点 | `/review-ticket` | `/check-all` |
|------|-----------------|--------------|
| 対象 | 単一チケット | 全 ✅ チケット |
| 深さ | 詳細レビュー（コード品質・翻訳可能性・観測検証） | **深層検証＋是正**（テスト実験・較正ループの再実行、RFC 交叉参照、不足コードの追加、観測レポート生成） |
| ステータス変更 | `done` → `reviewed` に遷移 | ステータス変更なし |
| 是正 | なし（指摘のみ） | **あり**（不足テスト・観測レポート・定数修正を自動実行） |
| 実行タイミング | 各チケット完了時 | **マイルストーン完了時 / RFC改訂後 / リリース前** |

## 6 フェーズ構成

### Phase 0: 初期化 + チケット一覧取得

```bash
# darviumRoot の解決
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
_DARVIUM_ROOT=$(node -e "
  const p = require('path');
  const c = require('fs').readFileSync('$_R/contexts/dev.md','utf8');
  const m = c.match(/DARVIUM_ROOT\s*=\s*(.+)/);
  process.stdout.write(m ? p.resolve(m[1].trim().replace(/^~/,require('os').homedir())) : '');
")
echo "$_DARVIUM_ROOT"
```

`run-check-all.js` を軽量モードで実行し、✅ チケット一覧を取得する：

```bash
node "$_R/scripts/tickets/check-all/run-check-all.js" "$_DARVIUM_ROOT" 2>/dev/null
```

出力 JSON から以下の情報を抽出する：
- ✅ チケットの label, ticketId, title, rfcSections
- specPath, contextDir
- artifacts 存在有無
- spec から抽出した Scope 型/関数リスト、Test Plan テスト名リスト

---

### Phase 1: チケット単位 深層検証（全 ✅ チケットを順次処理）

各チケットに対して Step 1.1 〜 Step 1.8 を実行する。

#### Step 1.1 — spec 読み取り

```bash
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/read-artifact.js" <ticketId> spec
```

抽出する情報：
- **Scope**: 型・列挙型・トレイト・関数一覧
- **Test Plan**: 全テストケース（ID、入力、期待結果）
- **計装方法・観測対象**: 数学的観測手法、アンサンブルサイズ n、統計量
- **較正計画**: 対象定数、目的関数 J(θ)、実験系列
- **Acceptance Criteria**: 全項目
- **RFC 参照**: §番号一覧

#### Step 1.2 — RFC 該当セクション検証

spec の RFC 参照（§番号）に対応する RFC セクションを読み、spec および実装と比較する：

```bash
head -n 300 "$_DARVIUM_ROOT/Darvium-RFC-0001-Unified-v2.3-final.md"
# または該当 § を検索
grep -n "^## " "$_DARVIUM_ROOT/Darvium-RFC-0001-Unified-v2.3-final.md"
```

検証項目：
- 不変条件・数式が spec と一致しているか
- 型定義が spec Scope と一致しているか
- 定数値が付録 A の値と一致しているか
- エラー型が付録 B の定義と一致しているか
- 健全性命題（Soundness Proposition）が実装で保証されているか

矛盾を発見したらその場で修正し、修正内容を記録する。

#### Step 1.3 — 定数交叉参照

```bash
grep "^pub const " "$_DARVIUM_ROOT/src/constants.rs"
```

検証：
- spec 較正計画の定数が `src/constants.rs` に存在するか
- 値が RFC 付録 A の定義と一致するか
- 定数分類（Safety Invariant / Environment Policy Knob / Calibration Candidate）がコメントに明記されているか

不一致 → `src/constants.rs` を修正。

#### Step 1.4 — エラー型交叉参照

```bash
grep "^pub enum " "$_DARVIUM_ROOT/src/error.rs"
```

検証：
- spec Scope のエラー型が `src/error.rs` に存在するか
- バリアントが RFC 付録 B の定義と一致するか

不足 → RFC 付録 B に従い `src/error.rs` に追加。

#### Step 1.5 — ソースコード型/関数存在検証

```bash
grep -rn "^pub \(struct\|trait\|enum\)" "$_DARVIUM_ROOT/src/" | grep "<name>"
grep -rn "^pub fn" "$_DARVIUM_ROOT/src/" | grep "<name>"
```

検証：
- spec Scope の全型（struct/trait/enum）が `src/*.rs` で `pub` 定義されているか
- spec Scope の全関数が `src/*.rs` で定義されているか

不足 → spec Scope に従い実装追加。追加後 `cargo build` でコンパイル確認。

#### Step 1.6 — テストコード存在検証

spec Test Plan の全テストケースが `src/*.rs` の `#[cfg(test)]` ブロックに実在するか検証：

```bash
# テスト関数一覧を取得
grep -rn "^\s*fn " "$_DARVIUM_ROOT/src/" | grep -v "^\s*fn " | grep -v "^pub"
# またはテストモジュール内の関数一覧
awk '/#\[cfg\(test\)\]/,0' "$_DARVIUM_ROOT/src/"*.rs | grep "fn "
```

命名規則：
- ユニットテスト: `{action}_{normal|exceeded|at_boundary}`
- 観測テスト: `ots{number}_{description}`
- 状態遷移テスト: `legal_{from}_to_{to}`, `illegal_from_{state}`

不足 → spec Test Plan に従いテストコードを追加実装：
- 不変条件テストは `assert!` / `assert_eq!`
- 観測テストは `println!` + `--nocapture` 形式
- 固定シード PRNG（`StdRng::seed_from_u64(12345)`）を使用

追加後 `cargo test` でグリーン確認。

#### Step 1.7 — 観測レポート検証

observation artifact（`observation.md`）の存在と品質を検証：

```bash
# observation の存在確認
ls "$CONTEXT_DIR/observation.md"
```

6 セクション構成を満たすか確認：
1. **Instrumentation**: 計装方法の記述（テストフレームワーク、測定手法、アンサンブルサイズ n）
2. **Test execution results**: 実際の `cargo test --nocapture` 出力の貼付
3. **Calibration loop**: 較正ループの実験記録（実験ID、親実験ID、各反復の観測値）
4. **Interpretation**: 実験結果の解釈（統計量、分布形状、収束性）
5. **Objective function J(θ) evaluation**: 目的関数の評価（収束速度・定常誤差・オーバーシュート）
6. **Implications**: RFC 該当 § 参照と次ステップへの示唆

**欠落または内容不足の場合** → テスト再実行＋観測レポート生成：

```bash
# 全観測テストを実行
cd "$_DARVIUM_ROOT"
cargo test -- --nocapture 2>&1 | tee /tmp/observation-output.txt

# save-artifact.js で観測レポートを保存
node "$_R/scripts/tickets/save-artifact.js" <ticketId> observation \
  --report "$(cat /tmp/observation-output.txt)"
```

#### Step 1.8 — RFC 事後無矛盾確認

現状の実装が RFC 該当 § の記述と矛盾しないことを最終確認：
- 不変条件がコードで保証されていること
- 数式が正しく実装されていること
- 定数値・エラー型が一致していること

矛盾 → 修正。

---

### Phase 2: 是正ループ

Phase 1 で発見した問題を自動修正する。以下の対応表に従う：

| 問題 | 対応 | 確認コマンド |
|------|------|-------------|
| 観測レポート欠落 | テスト実行 + `save-artifact.js` で生成 | `cargo test <test> -- --nocapture` |
| テスト関数欠落 | spec Test Plan に従い追加実装 | `cargo test` でグリーン確認 |
| 定数値不一致 | RFC 付録 A の値に修正 | `cargo test` でグリーン確認 |
| エラー型欠落 | RFC 付録 B に従い追加 | `cargo build` |
| 型/関数欠落 | spec Scope に従い実装 | `cargo build` |
| RFC 矛盾 | 実装修正か RFC 解釈明確化 | 該当 § 再読＋テスト |

各修正の前に必ず spec Scope と Test Plan を再確認し、**完了済みチケットの範囲内であること**を確認する。該当チケットの spec に記載のない作業は、たとえ「必要そうに見えても」一切行わない。

各修正後の確認フロー：
1. 修正を適用
2. `cargo build` でコンパイル確認
3. `cargo test` で既存テストがレッドにならないことを確認
4. 修正内容を記録（最終レポート用）

---

### Phase 3: 全体再テスト

```bash
cd "$_DARVIUM_ROOT"
cargo test 2>&1
cargo test -- --nocapture 2>&1 | tail -200
```

- 全テストグリーン確認
- 観測出力確認（`println!` 出力が欠落なく出力されていること）

---

### Phase 4: グローバルチェック

```bash
cd "$_DARVIUM_ROOT"
cargo clippy -- -D warnings 2>&1
cargo fmt --check 2>&1
_R=$(cat DARVIUM_PLUGIN_ROOT.md)
node "$_R/scripts/tickets/validate-structure.js"
```

---

### Phase 5: 総合レポート表示

以下の形式でレポートを表示する：

```
━━━ /check-all 深層検証レポート ━━━

✓ PASS   M-2-1: RetrievalPrimitive (全8チェック通過)
✓ PASS   M-2-1.5: Dual-Store トレイト階層 (全8チェック通過)
⚠ FIXED  M-2-3: Mock クライアント (observation欠落→生成済)
⚠ FIXED  M-1.5-1: SearchState (定数不一致→修正済)
✓ FIXED  M-1-1: EvaluateCandidatesStep (全チェック, 観測レポート生成済)

是正サマリ:
  観測レポート生成: N件
  テストコード追加: N件
  定数修正: N件
  RFC矛盾修正: N件

グローバル:
  ✓ cargo test: N passed; 0 failed
  ✓ cargo clippy: passed
  ✓ cargo fmt: passed

翻訳可能性: N issues (major: N, warning: N, minor: N)

サマリ: N total | M PASS | N FIXED | 0 FAIL | 0 ERROR
```

## 注意事項

- **このコマンドは読み取り専用ではない**: Phase 2 で実際にコード・テスト・観測レポートを修正する。実行前にコミットまたはスタッシュしておくこと。
- **全チケットを順次処理する**: 1チケットあたりの処理時間は内容に依存する。観測テスト実行に時間がかかる場合は、適宜タイムアウト値を調整する。
- **RFC との矛盾は最優先**: テストの追加より、RFC 不変条件との矛盾修正を優先する。
- **既存テストを壊さない**: 是正後は必ず全テストを再実行し、リグレッションがないことを確認する。
