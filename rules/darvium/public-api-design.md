---
name: Darvium Public API Design
description: Darvium crate の公開 API 設計原則 -- Facade パターン、MYCUTE 結合、カプセル化戦略
---

# Darvium Public API Design

> Darvium crate の公開 API は「Crate as a Product」の精神で設計される。
> 内部実装の完成だけでなく、公開 API の完全性 + MYCUTE 統合 + rustdoc までが完了条件である。

## Darvium Facade 原則

Darvium crate の公開 API は単一の Facade 構造体とその設定構造体のみで構成する：

```rust
// これが Darvium の全ての公開 API
use darvium::{Darvium, DarviumConfig, DarviumError};

let config = DarviumConfig::default();
let engine = Darvium::new(config);
let result = engine.search(query)?;
```

### ルール

- **コンストラクタ**: `Darvium::new(config: DarviumConfig) -> Self`
- **メソッド**: 必要最小限の公開メソッドのみ。各メソッドは内部4層を協調させる。
- **設定**: `DarviumConfig` は Builder パターンまたは `Default` を実装する。
- **エラー**: 全ての公開メソッドは `Result<_, DarviumError>` を返す。

## カプセル化戦略

### モジュール可視性ルール

| シンボル | 可視性 | 理由 |
|----------|--------|------|
| Darvium 構造体 | pub | 外部使用者がインスタンス化する唯一の型 |
| DarviumConfig | pub | 外部使用者が設定を注入する型 |
| DarviumError | pub | エラー処理のために外部から参照可能にする必要あり |
| WorkflowGraph, QueryRepresentation 等の主要型 | pub | メソッドの引数・戻り値として必要 |
| WorkflowLayer, RetrievalCore 等 | pub(crate) | 内部層は外部に一切公開しない |
| ports::RetrievalPrimitive 等 | pub（トレイト） | FakeImpl を外部テストで使う場合のみ公開 |
| fakes::* | pub(crate) または #[cfg(test)] | テストコード専用 |
| constants::* | pub(crate) | 外部から定数を直接参照させない |

### 再公開パターン

```rust
// src/lib.rs -- 公開 API の再公開
mod error;
mod types;

pub use error::DarviumError;
pub use types::{DarviumConfig, WorkflowGraph, QueryRepresentation, CandidateSet};
```

内部モジュールの型は `pub use` で `lib.rs` から再公開し、使用者が深いパスを書かなくて済むようにする。

## MYCUTE 結合検証手順

公開 API の設計時は必ず以下の手順を実施する：

1. **実際の MYCUTE コードを確認する**: `~/shyme/mycute/src/` で Darvium をどのように使う想定かを確認する
2. **仮想的な使用コードを書く**: API 設計後に `use darvium::Darvium;` から始まる仮想的なコードを書き、使い勝手を確認する
3. **MYCUTE の Cargo.toml と整合性を確認する**: MYCUTE 側の feature flag `darvium` との整合性を確認する
4. **MYCUTEとの結合が困難な API を拒否する**: 複雑な内部型を公開要求する設計や、MYCUTE 側に過度な設定を強いる設計は禁止

```
// MYCUTE 側から見た理想的な使用コード
// Cargo.toml: darvium = { path = "crates/darvium" }
//
// use darvium::{Darvium, DarviumConfig};
//
// fn setup_darvium() -> Darvium {
//     let config = DarviumConfig::builder()
//         .trust_decay(0.70)
//         .max_search_depth(100)
//         .build();
//     Darvium::new(config)
// }
//
// fn process_search(engine: &Darvium, query: &str) -> Result<Vec<Candidate>, Error> {
//     let result = engine.search(query.parse()?)?;
//     Ok(result.candidates)
// }
```

## pub の最小化原則

- `pub` は必要最小限のシンボルのみに付与する
- 一度 `pub` にしたシンボルは後方互換性の制約となるため、公開前に十分に検討する
- 疑問がある場合は `pub(crate)` で一旦内部公開し、必要になってから `pub` に昇格する
- 列挙型は `#[non_exhaustive]` を付与し、将来のバリアント追加に備える

```rust
#[non_exhaustive]
pub enum DarviumError {
    GraphValidation,
    CycleDetected,
    RetrievalTimeout,
    // ... 将来追加可能
}
```

## rustdoc 義務

公開 API には全数ドキュメントコメント必須。以下の内容を含める：

- **概要**: 型・関数の目的（1〜2文）
- **引数**: 各引数の説明（関数の場合）
- **戻り値**: 戻り値の説明とエラーケース
- **パニック**: パニックする条件（ある場合のみ）
- **例**: 使用方法を示す `# Example` セクション（必須ではないが強く推奨）

```rust
/// Darvium 検索エンジンの設定構造体。
///
/// Builder パターンで構築し、`Darvium::new()` に渡す。
///
/// # Example
///
/// ```
/// use darvium::DarviumConfig;
///
/// let config = DarviumConfig::builder()
///     .trust_decay(0.70)
///     .build();
/// ```
pub struct DarviumConfig {
    // ...
}
```

`cargo doc --no-deps` でドキュメントが警告なく生成されることを確認する。

## References

See `rules/darvium/rfc-governance.md` for RFC cross-reference governance.
See `rules/rust/patterns.md` Darvium Facade パターン for architecture details.
