---
paths:
  - "**/*.rs"
---
# Rust Security

> This file extends [common/security.md](../common/security.md) with Rust-specific content.

## Secrets Management

- Never hardcode API keys, tokens, or credentials in source code
- Use environment variables: `std::env::var("API_KEY")`
- Fail fast if required secrets are missing at startup
- 設定値は設定管理システム（SQLiteベース）で一元管理

```rust
// BAD
const API_KEY: &str = "sk-abc123...";

// GOOD — environment variable with early validation
fn load_api_key() -> anyhow::Result<String> {
    std::env::var("PAYMENT_API_KEY")
        .context("PAYMENT_API_KEY must be set")
}
```

## SQL Injection Prevention

- Always use parameterized queries — never format user input into SQL strings
- Use query builder or ORM (sqlx, diesel, sea-orm) with bind parameters

```rust
// BAD — SQL injection via format string
let query = format!("SELECT * FROM users WHERE name = '{name}'");
sqlx::query(&query).fetch_one(&pool).await?;

// GOOD — parameterized query with sqlx
// Placeholder syntax varies by backend: Postgres: $1  |  MySQL: ?  |  SQLite: $1
sqlx::query("SELECT * FROM users WHERE name = $1")
    .bind(&name)
    .fetch_one(&pool)
    .await?;
```

## Input Validation

- Validate all user input at system boundaries before processing
- Use the type system to enforce invariants (newtype pattern)
- Parse, don't validate — convert unstructured data to typed structs at the boundary
- Reject invalid input with clear error messages

```rust
// Parse, don't validate — invalid states are unrepresentable
pub struct Email(String);

impl Email {
    pub fn parse(input: &str) -> Result<Self, ValidationError> {
        let trimmed = input.trim();
        let at_pos = trimmed.find('@')
            .filter(|&p| p > 0 && p < trimmed.len() - 1)
            .ok_or_else(|| ValidationError::InvalidEmail(input.to_string()))?;
        let domain = &trimmed[at_pos + 1..];
        if trimmed.len() > 254 || !domain.contains('.') {
            return Err(ValidationError::InvalidEmail(input.to_string()));
        }
        // For production use, prefer a validated email crate (e.g., `email_address`)
        Ok(Self(trimmed.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}
```

## Unsafe Code

- Minimize `unsafe` blocks — prefer safe abstractions
- Every `unsafe` block must have a `// SAFETY:` comment explaining the invariant
- Never use `unsafe` to bypass the borrow checker for convenience
- Audit all `unsafe` code during review — it is a red flag without justification
- Prefer `safe` FFI wrappers around C libraries

```rust
// GOOD — safety comment documents ALL required invariants
let widget: &Widget = {
    // SAFETY: `ptr` is non-null, aligned, points to an initialized Widget,
    // and no mutable references or mutations exist for its lifetime.
    unsafe { &*ptr }
};

// BAD — no safety justification
unsafe { &*ptr }
```

## Dependency Security

- Run `cargo audit` to scan for known CVEs in dependencies
- Run `cargo deny check` for license and advisory compliance
- Use `cargo tree` to audit transitive dependencies
- Keep dependencies updated — set up Dependabot or Renovate
- Minimize dependency count — evaluate before adding new crates

```bash
# Security audit
cargo audit

# Deny advisories, duplicate versions, and restricted licenses
cargo deny check

# Inspect dependency tree
cargo tree
cargo tree -d  # Show duplicates only
```

## Error Messages

- Never expose internal paths, stack traces, or database errors in API responses
- Log detailed errors server-side; return generic messages to clients
- Use `tracing` or `log` for structured server-side logging

```rust
// Map errors to appropriate status codes and generic messages
// (Example uses axum; adapt the response type to your framework)
match order_service.find_by_id(id) {
    Ok(order) => Ok((StatusCode::OK, Json(order))),
    Err(ServiceError::NotFound(_)) => {
        tracing::info!(order_id = id, "order not found");
        Err((StatusCode::NOT_FOUND, "Resource not found"))
    }
    Err(e) => {
        tracing::error!(order_id = id, error = %e, "unexpected error");
        Err((StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"))
    }
}
```

## References

See skill: `rust-patterns` for unsafe code guidelines and ownership patterns.
See skill: `security-review` for general security checklists.

---

## MYCUTE Chain of Trust Security Model

MYCUTE はオーナー事務局を起点とする多層署名構造（マトリョーシカ構造）で動作する：

```text
オーナー秘密鍵 ──署名──→ CA任命証 (CA_PubKey + expire_at)
                                │
                                ├──署名──→ 開発者証明書 (Dev_PubKey + expire_at)
                                │               │
                                │               ├──署名──→ アプリ (.mycute ファイル)
                                │               │
                                │               └──署名──→ tickets (予算証明)
                                │
                                └── 自身で署名 ──→ ブラックリスト更新
```

### 検証ルール
- **オーナー公開鍵はバイナリにハードコード**: 外部認証局に依存しない自己完結型の信頼起点
- **有効期限 (expire_at) は署名対象に含まれる**: 改ざんすれば署名検証が即座に失敗する
- **検証はローカル（オフライン）で完結**: 毎回の検証に外部サーバーへの問い合わせ不要
- **`Ed448Signature` 型を `utils::crypto` 経由で使用**: 生のed448-goldilocks APIを直接呼ばない

### タイムスタンプ検証プロトコル
すべてのP2P通信は相互時刻検証を必須とする：
1. リクエストに送信側のタイムスタンプと CA Base URL を含める
2. 受信側はブラックリストチェック後、応答に自身のタイムスタンプを付与
3. 往復の時刻誤差が許容範囲を超える場合は通信を拒否

### ブラックリスト機構
- **L3 ノードのみが CA へ不正報告可能**: 誰でも告発できるわけではない
- **数学的証拠 (Proof of Malfeasance) が必要**: 証拠なき通報は逆に通報者が制裁を受ける
- **削除しても同期で戻る**: ローカルで削除しても CA との次回同期で自動復元される
- **自己執行**: 自分がブラックリストに載ったことを検知したら自動機能停止

### Singleton Lock (シングルトンロック)
- 同一マシン上で同時に起動できる MYCUTE インスタンスは 1 つのみ
- ロックファイル (`~/.mycute/*.lock`) により物理的な排他制御を行う
- このロックはシビル攻撃対策の要であり、迂回・無効化は禁止

### Unsafe Code 特則
- 正当な `unsafe` の使用例：ObjC FFI (`objc_msgSend`)、Cocoa フレームワーク呼び出し
- `// SAFETY:` コメントには **どの不変条件が満たされているか** を具体的に記述
- macOS プラットフォーム固有のコード（`block`, `objc`, `cocoa` クレート依存）は `#[cfg(target_os = "macos")]` でガードする

### ロールベースアクセス制御ポリシー

MYCUTE の JWT 認証を必要とする全 REST API エンドポイントは、原則として `JwtRole::USR` のみアクセスを許可する。BD/APX/VDR ロールは管理機能に限定し、将来的に全廃予定。

- ハンドラー冒頭の `ju.allow_roles(&[JwtRole::USR])?` で制御すること
- やむを得ず BD/APX/VDR を許可する場合は、SECURITY.md にその理由と有効期限を明記する
