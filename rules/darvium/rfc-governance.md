---
name: Darvium RFC Governance
description: Darvium 開発における RFC 3文書の絶対正本管理・交叉参照・無矛盾チェックのルール
---

# Darvium RFC Governance

> Darvium 開発の基本原則：**RFC が絶対正本であり、3文書の常時参照が実装の前提条件である。**

## 3文書の位置づけ

Darvium crate の開発は以下の3文書を絶対的な正本とし、これらと無矛盾であることが全てのコードの必須条件である。

| 文書 | 役割 | パス |
|------|------|------|
| **RFC-0001 v2.3-final** | 理論・設計・数式・アルゴリズムの絶対正本 | `$DARVIUM_RFC` |
| **Tickets** | フェーズ定義・チケット詳細・完了条件 | `$DARVIUM_TICKETS` |
| **TableSpec** | データ構造・テーブル設計・型定義 | `$DARVIUM_TABLE_SPEC` |

これらの文書へのパスは `contexts/dev.md` で定数として定義され、常に参照可能である。

## 事前交叉参照ルール

**実装着手前に必ず RFC 該当セクションを読むこと。**

```
実装着手
  |
[1] RFC 該当セクションを特定して読む
  |    例：検索機能を実装する -> RFC §5 を読む
  |    例：信頼伝播を実装する -> RFC §4.2 を読む
[2] 設計意図・数式・制約を理解する
  |
[3] Tickets で該当チケットの完了条件を確認する
  |
[4] TableSpec で該当データ構造の定義を確認する
  |
コードを書く
```

このルールは /plan 承認の有無にかかわらず全ての実装に適用される。

## 事後無矛盾チェック

**実装完了後に RFC との矛盾がないことを最低1セクション確認する。**

```
コードを書いた
  |
[1] 追加した型・関数が RFC の命名規則・型定義と一致しているか確認
[2] 実装したロジックが RFC の数式・アルゴリズムと矛盾していないか確認
[3] エラー型が RFC Annex B の定義と一致しているか確認
[4] 定数値が RFC の規定値と一致しているか確認
```

確認が取れるまで完了報告は禁止。

## 日常的点検ルール

新しい型・関数・定数を追加するたびに、以下の点検を実施する：

1. **型の命名**: RFC で定義された用語と一致しているか？（WorkflowGraph, SearchTrace 等）
2. **定数値**: RFC のセクションで規定された値と一致しているか？
3. **エラー型**: Annex B のエラー型リストに含まれているか？
4. **API シグネチャ**: 公開 API が RFC のインターフェース定義と一致しているか？
5. **状態遷移**: 状態機械の遷移が RFC の遷移行列と一致しているか？

## 矛盾発見時の手順

RFC と実装の矛盾を発見した場合：

1. **即座に作業を中断する**
2. 矛盾の内容を特定し、RFC の該当セクション番号・行番号を記録する
3. 以下のいずれかを判断する：
   - **実装が間違っている**: 実装を RFC に合わせて修正する
   - **RFC に誤り・不足がある**: RFC を修正する（修正内容を RFC へのトレースバックとして記録）
4. 矛盾解消後に作業を再開する

**「実装を進めて後で直す」は絶対に許容しない。** 矛盾を抱えたままの実装進行は禁止。

## 3文書への参照方法

常に `contexts/dev.md` で定義された環境変数パス定数経由で参照する：

```
$DARVIUM_RFC       -- RFC-0001 v2.3-final 全文
$DARVIUM_TICKETS   -- Darvium Tickets 詳細
$DARVIUM_TABLE_SPEC -- Table/Struct 定義仕様
```

Bash での参照例：

```bash
# RFC の該当セクションを読む
head -n 200 "$DARVIUM_RFC"

# Tickets で該当フェーズを確認
grep -n "M-2|M-1" "$DARVIUM_TICKETS"
```

## References

See `contexts/dev.md` for path constants and workspace configuration.
See `rules/darvium/public-api-design.md` for public API design governance.
