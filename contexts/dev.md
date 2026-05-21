# Development Context — Darvium

Mode: Active development
Focus: Implementation, coding, building features

## Technology Stack
- **Primary**: Rust (edition 2021), pure library crate
- **Architecture**: 4-layer (Workflow IR / GMR Retrieval / SearchWorkflow / Lifecycle+GC)
- **Graph**: petgraph (DAG-based WorkflowGraph)
- **Metadata Store**: SQLite (rusqlite / SeaORM)
- **Knowledge Store**: LadybugDB
- **Testing**: Observational (statistical/simulation-driven), proptest, rstest
- **Error Handling**: thiserror (all errors in src/error.rs)
- **Serialization**: serde + serde_json

## 絶対正本文書 (定数パス)

```text
DARVIUM_RFC       = ~/shyme/mycute/crates/darvium/Darvium-RFC-0001-Unified-v2.0-final.md
DARVIUM_TICKETS   = ~/shyme/mycute/crates/darvium/Darvium-Tickets.md
DARVIUM_TABLE_SPEC = ~/shyme/mycute/crates/darvium/Darvium-v2.0-final-table-and-struct-definition-spec.md
DARVIUM_ROOT      = ~/shyme/mycute/crates/darvium/
MYCUTE_ROOT       = ~/shyme/mycute/
```

これらは Darvium 開発の絶対正本であり、実装の全決定はこれらと無矛盾でなければならない。

## Behavior
- 日本語でコミュニケーション（チャット・コメント・設計書）
- 実行ログ（log::info! 等）は英語
- Plan Gate: 自明でない変更は計画承認を得てから実装
- **RFC 交叉参照**: 実装前後に絶対正本文書と照合する
- **観測ベース検証ファースト**: テストは振る舞いの特徴付け。assert + 統計的観測
- **Fake-First**: PortTrait → FakeImpl の順で実装
- **較正ループ**: constants.rs → cargo test → 観測 → 解釈 → 反復
- **Crate as a Product**: 公開 API 完全性・MYCUTE 結合確認・RFC 無矛盾・rustdoc までが完了
- Boy Scout Rule: 触ったコードはルールに準拠させる
- 「効率化」より「丁寧さ」を優先

## Commands
- `cargo test`: テスト実行
- `cargo test -- --nocapture`: 観測テスト出力表示
- `cargo test --features integration_llm`: LLM結合テスト
- `cargo clippy -- -D warnings`: リント
- `cargo fmt`: フォーマット
- `cargo llvm-cov`: カバレッジ
- `cargo doc --open`: ドキュメント生成

## Priorities
1. Get it right (RFC 無矛盾、型安全性)
2. Get it observable (観測可能な振る舞い、統計的検証)
3. Get it consumable (MYCUTE から使いやすい公開 API)
4. Get it clean (可読性、保守性)
