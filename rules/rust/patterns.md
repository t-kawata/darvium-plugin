---
paths:
  - "**/*.rs"
---
# Rust Patterns

> This file extends [common/patterns.md](../common/patterns.md) with Rust-specific content.

## Repository Pattern with Traits

Encapsulate data access behind a trait:

```rust
pub trait OrderRepository: Send + Sync {
    fn find_by_id(&self, id: u64) -> Result<Option<Order>, StorageError>;
    fn find_all(&self) -> Result<Vec<Order>, StorageError>;
    fn save(&self, order: &Order) -> Result<Order, StorageError>;
    fn delete(&self, id: u64) -> Result<(), StorageError>;
}
```

Concrete implementations handle storage details (Postgres, SQLite, in-memory for tests).

## Service Layer

Business logic in service structs; inject dependencies via constructor:

```rust
pub struct OrderService {
    repo: Box<dyn OrderRepository>,
    payment: Box<dyn PaymentGateway>,
}

impl OrderService {
    pub fn new(repo: Box<dyn OrderRepository>, payment: Box<dyn PaymentGateway>) -> Self {
        Self { repo, payment }
    }

    pub fn place_order(&self, request: CreateOrderRequest) -> anyhow::Result<OrderSummary> {
        let order = Order::from(request);
        self.payment.charge(order.total())?;
        let saved = self.repo.save(&order)?;
        Ok(OrderSummary::from(saved))
    }
}
```

## Newtype Pattern for Type Safety

Prevent argument mix-ups with distinct wrapper types:

```rust
struct UserId(u64);
struct OrderId(u64);

fn get_order(user: UserId, order: OrderId) -> anyhow::Result<Order> {
    // Can't accidentally swap user and order IDs at call sites
    todo!()
}
```

## Enum State Machines

Model states as enums — make illegal states unrepresentable:

```rust
enum ConnectionState {
    Disconnected,
    Connecting { attempt: u32 },
    Connected { session_id: String },
    Failed { reason: String, retries: u32 },
}

fn handle(state: &ConnectionState) {
    match state {
        ConnectionState::Disconnected => connect(),
        ConnectionState::Connecting { attempt } if *attempt > 3 => abort(),
        ConnectionState::Connecting { .. } => wait(),
        ConnectionState::Connected { session_id } => use_session(session_id),
        ConnectionState::Failed { retries, .. } if *retries < 5 => retry(),
        ConnectionState::Failed { reason, .. } => log_failure(reason),
    }
}
```

Always match exhaustively — no wildcard `_` for business-critical enums.

## Builder Pattern

Use for structs with many optional parameters:

```rust
pub struct ServerConfig {
    host: String,
    port: u16,
    max_connections: usize,
}

impl ServerConfig {
    pub fn builder(host: impl Into<String>, port: u16) -> ServerConfigBuilder {
        ServerConfigBuilder {
            host: host.into(),
            port,
            max_connections: 100,
        }
    }
}

pub struct ServerConfigBuilder {
    host: String,
    port: u16,
    max_connections: usize,
}

impl ServerConfigBuilder {
    pub fn max_connections(mut self, n: usize) -> Self {
        self.max_connections = n;
        self
    }

    pub fn build(self) -> ServerConfig {
        ServerConfig {
            host: self.host,
            port: self.port,
            max_connections: self.max_connections,
        }
    }
}
```

## Sealed Traits for Extensibility Control

Use a private module to seal a trait, preventing external implementations:

```rust
mod private {
    pub trait Sealed {}
}

pub trait Format: private::Sealed {
    fn encode(&self, data: &[u8]) -> Vec<u8>;
}

pub struct Json;
impl private::Sealed for Json {}
impl Format for Json {
    fn encode(&self, data: &[u8]) -> Vec<u8> { todo!() }
}
```

## API Response Envelope

Consistent API responses using a generic enum:

```rust
#[derive(Debug, serde::Serialize)]
#[serde(tag = "status")]
pub enum ApiResponse<T: serde::Serialize> {
    #[serde(rename = "ok")]
    Ok { data: T },
    #[serde(rename = "error")]
    Error { message: String },
}
```

## References

See skill: `rust-patterns` for comprehensive patterns including ownership, traits, generics, concurrency, and async.

---

## MYCUTE-Specific Patterns

### Multi-Binary Architecture

MYCUTE は 3 つのバイナリを持つマルチバイナリ構成。`Cargo.toml` の `[[bin]]` 定義に従う：

| Binary | Path | Purpose |
|--------|------|---------|
| `mycute` | `src/main.rs` | GUI モード（Tauri）、サーバーモード（ヘッドless）、マイグレーション |
| `mycute-server-core` | `src/server.rs` | スタンドアロンサーバー本体。GUI 非依存 |
| `mycute-server` | `src/launcher.rs` | 配布用サーバーバイナリ。core とネイティブライブラリを内包 |

- 共通ロジックは `src/` 直下のモジュールツリーに配置し、各バイナリから参照する
- `mycute-server`（launcher）は `include_bytes!` で `target/release` の core バイナリを埋め込む。ビルド順序に注意

### Tauri v2 Commands

Tauri コマンドは機能ごとにファイル分割し `src/tauri_cmd/` モジュールに集約する：

```rust
// src/tauri_cmd/voice.rs
#[tauri::command]
pub async fn start_recording(app: tauri::AppHandle) -> Result<(), String> {
    // 実装
}

// src/tauri_cmd/settings.rs
#[tauri::command]
pub async fn get_setting(key: String) -> Result<String, String> {
    // 実装
}
```

- `#[tauri::command]` は async 関数とし、戻り値は `Result<T, String>` またはシリアライズ可能な型
- フロントエンドからは `invoke('plugin:mycute|command_name')` で呼び出し
- AppHandle が必要な場合は関数の引数に `app: tauri::AppHandle` を追加

### Axum + utoipa Routing

MYCUTE は utoipa を用いた OpenAPI ドキュメント自動生成と統合したルーティングを行う：

```rust
use utoipa::OpenApi;
use utoipa_axum::{router::OpenApiRouter, routes};

#[derive(OpenApi)]
#[openapi(info(title = "MYCUTE API", version = "1.0.0"))]
struct ApiDoc;

// utoipa-axum の OpenApiRouter でルートを定義
let (router, api) = OpenApiRouter::with_openapi(ApiDoc::openapi())
    .nest("/v1", app_routes())
    .split_for_parts();

// axum 標準の Router にフォールバック
let app = Router::new()
    .merge(router);
```

- **API 定義と実装の一体化**: `#[utoipa::path]` アトリビュートでリクエスト/レスポンススキーマをハンドラーに直接記述
- **`utoipa-axum` の `routes!` マクロ**を使用してハンドラーを登録
- 全てのハンドラーは `anyhow::Result` またはカスタムエラー型を返す
- 状態管理は `axum::extract::State` と `Arc` で行う

```rust
#[utoipa::path(
    get,
    path = "/v1/ca/apply",
    params(MyRequest),
    responses(
        (status = 200, description = "Success"),
        (status = 400, description = "Bad request"),
    ),
)]
async fn apply_ca(
    State(state): State<Arc<AppState>>,
    Query(params): Query<MyRequest>,
) -> Result<Json<MyResponse>, AppError> {
    // ...
}
```

### REST API Patterns

#### 実装サイクル
REST API 開発は **Route → Handler → Request → Response → Logic** の順で進める。インターフェースを先に固めることで設計矛盾を早期発見する。

#### Route 登録
`src/mode/rt/req_map.rs` に集約：

```rust
fn app_routes() -> OpenApiRouter {
    OpenApiRouter::new()
        .routes(routes!(search_usrs))
        .routes(routes!(create_usr))
}
```

- `OpenApiRouter::with_openapi(ApiDoc::openapi())` + `.nest("/v1", ...)` + `split_for_parts()`
- CRUD 順序: Search → Get → Create → Update → Delete
- 検索系は Body JSON + POST を基本

#### Handler パターン
`src/mode/rt/rthandler/[機能名]_handler.rs`。認証・委譲のみ：

```rust
pub async fn search_usrs(
    ju: JwtUsr, ids: JwtIDs,
    Extension(db): Extension<Arc<DbPools>>,
    Json(req): Json<SearchUsrsReq>,
) -> Result<impl IntoResponse, ApiError> {
    ju.allow_roles(&[JwtRole::USR])?;
    req.validate().map_err(|e| ApiError::from_garde(e))?;
    let conn = db.get_ro_for_rt()?;
    rtbl::usrs_bl::search_usrs(conn, &ju, &ids, req).await.map(Json)
}
```

- `ju.allow_roles` でロール制限（目標は全エンドポイント USR のみ）
- 読み取り: `get_ro_for_rt()` / 書き込み: `get_rw_for_rt()`
- ハンドラーファイルごとに `const TAG` を定義

#### Request パターン
`src/mode/rt/rtreq/[機能名]_req.rs`。`garde` バリデーション：

```rust
#[derive(Deserialize, Validate, ToSchema)]
pub struct SearchUsrsReq {
    #[schema(example = "山田 太郎")]
    #[serde(default)]
    #[garde(custom(length_simple_err(0, 50)))]
    pub name: String,
}
```

- `#[schema(example = ...)]` 必須（Swagger UI 用）
- `#[serde(default)]` でキー欠如対策、`garde` で 422 エラー化
- 標準 `garde` 属性の直接使用禁止 → カスタムアダプター経由

#### Response パターン
`src/mode/rt/rtres/[機能名]_res.rs`。フラット構造＋`From<Model>`：

```rust
#[derive(Serialize, ToSchema)]
pub struct SearchUsrsRes { pub usrs: Vec<SearchUsrsResItem> }
impl From<usrs::Model> for SearchUsrsResItem { /* ... */ }
```

- エラーは `ApiError`（`ErrorDetail { field, code, message }` のリスト）で統一
- 成功レスポンスに errors フィールドを含めない

#### Business Logic パターン
`src/mode/rt/rtbl/[機能名]_bl.rs`。非同期 SeaORM：

```rust
async fn find_usrs_base(ju: &JwtUsr, ids: &JwtIDs) -> Result<Select<usrs::Entity>, ApiError> {
    match ju.role() {
        JwtRole::USR => Ok(usrs::Entity::find()
            .filter(usrs::Column::ApxId.eq(ids.apx_id))
            .filter(usrs::Column::VdrId.eq(ids.vdr_id))
            .filter(usrs::Column::Id.eq(ids.usr_id))),
    }
}
```

- `find_..._base` で権限ベースのクエリ共通化（Search/Get/Update/Delete で再利用）
- Create/Update/Delete は `conn.transaction()` でラップ
- `ju.role()` + `match` でロール判定を明示

#### バリデーションアダプター
`garde` カスタムアダプターは4段階のマクロ生成で追加：

1. **基底ロジック**: 判定用トレイト定義（`rterr.rs`）
2. **汎用マクロ**: `define_numeric_adapter!` 等（`validators.rs`）
3. **アダプター実体化**: エラーコード `E0001`〜`E0023` を確定
4. **リクエスト適用**: `#[garde(custom(numeric_err))]`

エラーコード体系は `src/mode/rt/rterr/` で一元管理する。

#### P2P Clock Sync Middleware
全 P2P 通信で相互時刻検証を必須化：
1. リクエストにタイムスタンプ + 署名 + 公開鍵を含める
2. 受信側はブラックリストチェック後、時刻ズレを検証
3. 許容範囲超過時は通信拒否、CA へ報告
4. 応答に受信側タイムスタンプを付与

#### entities/ 直接編集禁止
`src/entities/` は `make gen-entities` の自動生成ファイルにつき直接編集禁止。スキーマ変更は migration → regenerate の順。

#### ロールポリシー
全 JWT 認証エンドポイントは `JwtRole::USR` のみ許可を目標とする。BD/APX/VDR ロールは管理機能に限定し、将来的に全廃予定。

### SeaORM Entity Pattern

エンティティは `src/entities/` に `sea-orm-cli generate entity` で自動生成する：

```rust
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "identities")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub public_key: String,
    pub name: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::apps::Entity")]
    Apps,
}

impl ActiveModelBehavior for ActiveModel {}
```

- 自動生成後は手動編集せず、スキーマ変更は migration → regenerate の順で行う
- `#[sea_orm(column_name = "...")]` によるカラム名上書きは避け、DB のカラム名と Rust のフィールド名は snake_case で一致させる
- UTC タイムスタンプは `crate::impl_utc_timestamp_behavior!` マクロで適用する
- `with-serde both` フラグ付きで生成し、Serialize + Deserialize を自動導出する

### Migration Workflow

```bash
# 1. 新しいマイグレーションファイル生成
make gen-migration NAME=create_users_table

# 2. マイグレーション実行（スキーマ更新）
make migrate-up

# 3. スキーマからエンティティ再生成
make gen-entities DRIVER=sqlite  # または mysql/postgres
```

- **Schema First アプローチ**: マイグレーションファイルを先に書き、その後エンティティを自動生成する
- マイグレーション記述は `sea_orm_migration::prelude::*` と `schema::*` ヘルパーを使用
- マイグレーションの順序はディレクトリのタイムスタンプ順（`YYYYMMDDHHMMSS`）

### Ed448-Goldilocks 暗号パターン

署名・検証は `crate::utils::crypto` モジュールの専用関数を介して行う：

```rust
use crate::utils::crypto::{verify_signature, Ed448Signature};

// 署名検証
let sig: Ed448Signature = /* from hex */;
let is_valid = verify_signature(&public_key, &data, &sig)?;
```

- 公開鍵は 114 文字の Hex 文字列として扱う
- 生の ed448-goldilocks クレートの API を直接呼ばず、`utils::crypto` のラッパー関数を常に使用する
- 署名対象データには必ずタイムスタンプと有効期限を含める

### ポート定義

| 定数名 | ポート | 用途 |
|--------|--------|------|
| `RT_PORT` | 3910 | REST API (Axum) |
| `SW_PORT` | 3911 | Static content / proxy |
| `BIFROST_PORT` | 3912 | LLM Proxy |
| `ZEROCLAW_PORT` | 3913 | Agent Gateway |
| `PROXY_PORT` | 58300 | MITM HTTPS proxy |

ポート番号はハードコードせず定数として定義し、必要に応じて環境変数で上書き可能にすること。
