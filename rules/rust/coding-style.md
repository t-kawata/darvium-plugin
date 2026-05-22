---
paths:
  - "**/*.rs"
---
# Rust Coding Style

> This file extends [common/coding-style.md](../common/coding-style.md) with Rust-specific content.

## Formatting

- **rustfmt** for enforcement — always run `cargo fmt` before committing
- **clippy** for lints — `cargo clippy -- -D warnings` (treat warnings as errors)
- 4-space indent (rustfmt default)
- Max line width: 100 characters (rustfmt default)

## Immutability

Rust variables are immutable by default — embrace this:

- Use `let` by default; only use `let mut` when mutation is required
- Prefer returning new values over mutating in place
- Use `Cow<'_, T>` when a function may or may not need to allocate

```rust
use std::borrow::Cow;

// GOOD — immutable by default, new value returned
fn normalize(input: &str) -> Cow<'_, str> {
    if input.contains(' ') {
        Cow::Owned(input.replace(' ', "_"))
    } else {
        Cow::Borrowed(input)
    }
}

// BAD — unnecessary mutation
fn normalize_bad(input: &mut String) {
    *input = input.replace(' ', "_");
}
```

## Naming

Follow standard Rust conventions:
- `snake_case` for functions, methods, variables, modules, crates
- `PascalCase` (UpperCamelCase) for types, traits, enums, type parameters
- `SCREAMING_SNAKE_CASE` for constants and statics
- Lifetimes: short lowercase (`'a`, `'de`) — descriptive names for complex cases (`'input`)

## Ownership and Borrowing

- Borrow (`&T`) by default; take ownership only when you need to store or consume
- Never clone to satisfy the borrow checker without understanding the root cause
- Accept `&str` over `String`, `&[T]` over `Vec<T>` in function parameters
- Use `impl Into<String>` for constructors that need to own a `String`

```rust
// GOOD — borrows when ownership isn't needed
fn word_count(text: &str) -> usize {
    text.split_whitespace().count()
}

// GOOD — takes ownership in constructor via Into
fn new(name: impl Into<String>) -> Self {
    Self { name: name.into() }
}

// BAD — takes String when &str suffices
fn word_count_bad(text: String) -> usize {
    text.split_whitespace().count()
}
```

## Error Handling

- Use `Result<T, E>` and `?` for propagation — never `unwrap()` in production code
- **Libraries**: define typed errors with `thiserror`
- **Applications**: use `anyhow` for flexible error context
- Add context with `.with_context(|| format!("failed to ..."))?`
- Reserve `unwrap()` / `expect()` for tests and truly unreachable states

```rust
// GOOD — library error with thiserror
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("failed to read config: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid config format: {0}")]
    Parse(String),
}

// GOOD — application error with anyhow
use anyhow::Context;

fn load_config(path: &str) -> anyhow::Result<Config> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {path}"))?;
    toml::from_str(&content)
        .with_context(|| format!("failed to parse {path}"))
}
```

## Iterators Over Loops

Prefer iterator chains for transformations; use loops for complex control flow:

```rust
// GOOD — declarative and composable
let active_emails: Vec<&str> = users.iter()
    .filter(|u| u.is_active)
    .map(|u| u.email.as_str())
    .collect();

// GOOD — loop for complex logic with early returns
for user in &users {
    if let Some(verified) = verify_email(&user.email)? {
        send_welcome(&verified)?;
    }
}
```

## Module Organization

Organize by domain, not by type:

```text
src/
├── main.rs
├── lib.rs
├── auth/           # Domain module
│   ├── mod.rs
│   ├── token.rs
│   └── middleware.rs
├── orders/         # Domain module
│   ├── mod.rs
│   ├── model.rs
│   └── service.rs
└── db/             # Infrastructure
    ├── mod.rs
    └── pool.rs
```

### Module File Responsibilities

各モジュールファイルの責務を以下の通り明確に区別する：

**`lib.rs`** — クレートの公開インターフェース定義とモジュール宣言に限定する。
- クレートレベルの属性（`#![...]`）の宣言
- 全トップレベルモジュールの宣言（`pub mod foo;`）
- 公開 API の再公開（`pub use crate::foo::Bar;`）
- Darvium の Facade 構造体定義は `lib.rs` に置いてもよい（ただし構造体宣言とコンストラクタのみ。ロジックは子モジュールへ委譲すること）
- 上記以外の実装ロジック（関数本体、impl ブロックのメソッド実装、トレイト実装等）を `lib.rs` に書いてはならない

**`mod.rs`** — 子モジュールの宣言と公開のみ。実装ロジックは一切書かない。
```rust
// ✅ 良い mod.rs
pub mod token;
pub mod middleware;

pub use self::token::TokenValidator;
pub use self::middleware::AuthMiddleware;

// ❌ 悪い mod.rs — 実装ロジックは別ファイルに書く
pub fn validate_token(t: &str) -> bool {
    t.len() > 32  // ← ここに書かず、token.rs に書く
}
```

根拠:
- `mod.rs` に実装を書くと、そのファイルが「モジュールの目次」なのか「実装ファイル」なのかがファイル名から判断できず、可読性を損なう
- `lib.rs` に実装を書くと、クレート全体の構造把握が困難になり、単一ファイルが肥大化する

例外:
- モジュール内の構造体・関数が 3 行以下の自明なもののみで、かつ別ファイルに分割すると逆に可読性が低下する場合に限り、`mod.rs` への直接記述を許容する。この場合も必ず `pub use` ではなく実体定義であることをコメントで明示すること。

**子モジュールファイル**（`token.rs`, `middleware.rs` 等）:
- `mod.rs` から `pub mod` 宣言された子モジュールの実装を記述する
- 公開する項目は `pub(crate)` または `pub` で修飾し、`mod.rs` 経由で再公開する

## Visibility

- Default to private; use `pub(crate)` for internal sharing
- Only mark `pub` what is part of the crate's public API
- Re-export public API from `lib.rs`

## 可読性とは翻訳可能性である（Readability as Translatability）

Rust は式指向の言語であり、関数やクロージャ、イテレータチェインを用いて処理の流れを宣言的に記述できる。この性質を活かし、**コードが日本語や英語の文章として読めること**を最優先する。

```rust
// ❌ 翻訳不可能: 何をしているか一目でわからない
fn h(v: &[u8], n: &str) -> String {
    let mut r = String::new();
    for b in v.iter().take(8) {
        r.push_str(&format!("{:02x}", b));
    }
    r.push(':');
    r.push_str(n);
    r
}

// ✅ 翻訳可能: 関数名と構造が語る
fn format_device_id(mac_bytes: &[u8], device_name: &str) -> String {
    let mac_hex = mac_bytes_to_hex(mac_bytes);
    format!("{mac_hex}:{device_name}")
}

fn mac_bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter()
        .take(8)
        .map(|b| format!("{b:02x}"))
        .collect::<Vec<_>>()
        .join("")
}
```

### 翻訳可能性を高める具体的なプラクティス

- **イテレータチェインは「〜をフィルターして、〜に変換して、集める」という日本語の流れとして読める**: 長すぎる場合は中間変数で段落を区切る
- **`if let Some(x) = ...` は「もし〜があれば、〜する」という条件節として読める**: `if x.is_some()` ＋ `unwrap()` の組み合わせより翻訳可能性が高い
- **enum と match の組み合わせは「〜の場合は〜し、〜の場合は〜する」という場合分けの文章として読める**: 早期リターンと組み合わせて自然言語の条件節に近づける
- **型エイリアスや newtype パターンはドメインの名詞をコードに導入する手段**: 生の `String` ではなく `UserId(String)` を使うことで「ユーザーID」という概念をコードに登場させる

```rust
// 翻訳可能性の高い Rust コードの例:
fn dispatch_command(state: &AppState, cmd: Command) -> Result<Response, Error> {
    // 「コマンドの種類に応じて分岐し、それぞれに適した処理を実行する」
    match cmd {
        Command::Query { table, id } => {
            let record = state.database.find_record(table, id)?;
            Ok(Response::Record(record))
        }
        Command::Insert { table, data } => {
            state.database.validate_schema(&table, &data)?;
            let id = state.database.insert_record(table, data)?;
            Ok(Response::Inserted { id })
        }
        Command::Delete { table, id } => {
            state.database.verify_record_exists(table, id)?;
            state.database.delete_record(table, id)?;
            Ok(Response::Deleted)
        }
    }
}
```

### コメントとの役割分担

- コード（関数名・変数名・構造）→ **「何をしているか」** を語る。コメントなしで翻訳可能であること
- コメント（日本語）→ **「なぜこの設計を選んだか」「どのような制約があるか」** を説明する
- 翻訳可能性の低いコードをコメントで補おうとしてはならない。コード自体を改善するのが唯一の正しい方法

## References

See skill: `rust-patterns` for comprehensive Rust idioms and patterns.
See `rules/rust/coding-style.md` for Darvium-specific conventions.

See skill: `rust-patterns` for comprehensive Rust idioms and patterns.
