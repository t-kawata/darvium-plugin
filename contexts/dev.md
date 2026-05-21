# Development Context — MYCUTE

Mode: Active development
Focus: Implementation, coding, building features

## Technology Stack
- **Backend**: Rust (edition 2021), multi-binary (mycute / mycute-server-core / mycute-server)
- **Desktop**: Tauri v2
- **API Server**: Axum 0.8 + utoipa (OpenAPI)
- **Database**: SeaORM (SQLite / PostgreSQL / MySQL)
- **Frontend**: Quasar (Vue.js 3, Composition API, `<script setup>`)
- **SDK**: TypeScript SDK (`sdk-ts/`)
- **Cryptography**: Ed448-Goldilocks (`utils::crypto::Ed448Signature`)
- **P2P**: EasyTier
- **Secondary**: Go (mycute-go, sample only — not for editing)

## Port Layout
- 3910: REST API (Axum), 3911: Static content/proxy, 3912: LLM Proxy
- 3913: Agent Gateway, 58300: MITM HTTPS proxy

## Behavior
- 日本語でコミュニケーション（チャット・コメント・設計書）
- 実行ログ（log::info! 等）は英語
- Plan Gate: 自明でない変更は計画承認を得てから実装
- TDD: テスト駆動開発を原則
- Boy Scout Rule: 触ったコードはルールに準拠させる
- 「効率化」より「丁寧さ」を優先

## Commands
- `make check-be`: Rustのみチェック
- `make check-fe`: フロントエンドのみチェック
- `make check-all`: 両方チェック
- `make test`: テスト実行（`make test TEST_ARGS="..."` でフィルタ）
- `make build`: リリースビルド
- `make build-dev`: デバッグビルド

## Priorities
1. Get it right (correctness first)
2. Get it safe (security, error handling)
3. Get it clean (readability, maintainability)
