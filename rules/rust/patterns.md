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

## Darvium-Specific Patterns

### PortTrait / FakeImpl パターン

Darvium の全外部依存はトレイト（PortTrait）として定義し、テスト用の FakeImpl を本物より先に書く（Fake-First 方法論）。

```text
    Consumer ──> PortTrait <── FakeImpl
    (lib.rs)     (ports.rs)     (fakes.rs)
                 Send+Sync      Deterministic
                 Error types    Call counter
                       |
                 RealImpl
                 (production)
```

```rust
// src/ports.rs — external dependency as trait
pub trait RetrievalPrimitive: Send + Sync {
    fn search(&self, query: &QueryRepresentation) -> Result<CandidateSet, RetrievalError>;
}

// src/fakes.rs — FakeImpl before production
pub struct FakeRetrieval {
    deterministic_result: CandidateSet,
    call_count: Arc<AtomicUsize>,
}

impl FakeRetrieval {
    pub fn new(result: CandidateSet) -> Self {
        Self {
            deterministic_result: result,
            call_count: Arc::new(AtomicUsize::new(0)),
        }
    }
    pub fn call_count(&self) -> usize {
        self.call_count.load(Ordering::SeqCst)
    }
}

impl RetrievalPrimitive for FakeRetrieval {
    fn search(&self, _query: &QueryRepresentation) -> Result<CandidateSet, RetrievalError> {
        self.call_count.fetch_add(1, Ordering::SeqCst);
        Ok(self.deterministic_result.clone())
    }
}

// Error-injection FakeImpl
pub struct FakeRetrievalAlwaysError;
impl RetrievalPrimitive for FakeRetrievalAlwaysError {
    fn search(&self, _query: &QueryRepresentation) -> Result<CandidateSet, RetrievalError> {
        Err(RetrievalError::Internal("simulated error".into()))
    }
}
```

原則：
- FakeImpl は **決定論的** でなければならない（隠れた乱数状態を持たない）
- コールカウンタ（`Arc<AtomicUsize>`）を付与し、意図しない呼び出しをテストで検出する
- エラー注入用の FakeImpl も用意し、異常系の観測テストを可能にする
- PortTrait は `Send + Sync` を継承し、`SimulationRunner` からの並行呼び出しに対応する

### Darvium Facade パターン

Darvium の公開 API は単一の Facade 構造体を通して提供する。内部の4層・Training・Fusion は完全カプセル化される。

```rust
// src/lib.rs — 唯一の公開エントリポイント
pub struct Darvium {
    config: DarviumConfig,
    layer2: WorkflowLayer,
    layer3a: RetrievalCore,
    layer3b: SearchEngine,
    layer3c: LifecycleManager,
}

impl Darvium {
    pub fn new(config: DarviumConfig) -> Self { /* ... */ }
    pub fn compile(&self, workflow: WorkflowGraph) -> Result<CompiledPlan, DarviumError> { /* ... */ }
    pub fn search(&self, query: QueryRepresentation) -> Result<CandidateSet, DarviumError> { /* ... */ }
}
```

カプセル化戦略：
- `src/lib.rs` の `pub` は `Darvium`, `DarviumConfig`, `DarviumError` に限定
- 内部モジュールは `pub(crate)` でクレート内共有に制限
- エラー型は `pub use error::DarviumError;` で再公開
- 内部型（WorkflowNode, QueryRepresentation 等）は必要に応じて pub use で再公開

```rust
// src/lib.rs — re-export pattern
mod layer2;
mod layer3a;
mod ports;
mod fakes;
mod constants;
mod error;
mod types;

pub use error::DarviumError;
pub use types::{DarviumConfig, WorkflowGraph, QueryRepresentation, CandidateSet};
```

### SimulationRunner パターン

N 回の反復実行を行い、統計的集計とレポートを生成するテスト用ランナー：

```rust
pub struct SimulationRunner<P, R> {
    primitive: P,
    iterations: usize,
    results: Vec<R>,
    seed: u64,
}

impl<P, R> SimulationRunner<P, R>
where
    P: RetrievalPrimitive,
    R: Measurable,
{
    pub fn new(primitive: P, iterations: usize) -> Self {
        Self {
            primitive,
            iterations,
            results: Vec::with_capacity(iterations),
            seed: 12345,
        }
    }

    pub fn run(&mut self, input: &QueryRepresentation) -> &[R] {
        let mut rng = StdRng::seed_from_u64(self.seed);
        self.results.clear();
        for _ in 0..self.iterations {
            let result = self.primitive.search(input).unwrap();
            self.results.push(result.measure(&mut rng));
        }
        &self.results
    }

    pub fn report(&self) -> SimulationReport {
        let stats = collect_statistics(&self.results);
        SimulationReport {
            iterations: self.iterations,
            seed: self.seed,
            mean: stats.mean,
            std: stats.std,
            p50: stats.percentile(50),
            p95: stats.percentile(95),
            p99: stats.percentile(99),
        }
    }
}
```

- `Measurable` トレイトで計測可能な任意の型を抽象化
- 統計集計は `SimulationReport` 構造体に集約
- 固定シードで完全再現性を保証
- マイルストーン別にイテレーション数を設定可能（M-2: 100, M0: 1000, M2: 10000）

### 観測テストハーネスパターン

テスト結果を構造化データとして収集・出力するハーネス：

```rust
pub struct ObservationalResult {
    pub experiment_id: String,
    pub config: HashMap<String, f64>,
    pub samples: Vec<f64>,
}

impl ObservationalResult {
    pub fn report(&self) -> String {
        let stats = collect_statistics(&self.samples);
        format!(
            "=== Experiment: {} ===
Config: {:?}
Results:
               mean={:.3}, std={:.3}, min={:.3}, max={:.3}
               p25={:.3}, p50={:.3}, p75={:.3}, p95={:.3}, p99={:.3}
             Status: OBSERVED (no assertion)",
            self.experiment_id, self.config,
            stats.mean, stats.std, stats.min, stats.max,
            stats.percentile(25), stats.percentile(50),
            stats.percentile(75), stats.percentile(95), stats.percentile(99),
        )
    }
}
```

### 較正コンフィグパターン

`constants.rs` の定数は RFC セクション番号でグループ化する：

```rust
// ================ Trust Propagation (§4.2) ================
pub const TRUST_INHERIT_DECAY: f64 = 0.70;  // RFC §4.2.1
pub const HUMAN_TRUST_K: f64 = 0.08;        // RFC §4.2.3
pub const SELF_CONF_DISCOUNT: f64 = 0.85;   // RFC §4.2.4

// ================ Temporal Decay (§4.3) ================
pub const TEMPORAL_LAMBDA_USE: f64 = 0.0001;     // RFC §4.3.1
pub const TEMPORAL_LAMBDA_VERIFY: f64 = 0.00005; // RFC §4.3.1
pub const TEMPORAL_ALPHA_BLEND: f64 = 0.35;      // RFC §4.3.2

// ================ Search Parameters (§5) ================
pub const GED_BLEND_MARGIN: usize = 5;          // RFC §5.3.2
pub const MAX_GRAPH_NODES: usize = 10_000;      // RFC §5.1
pub const MAX_COMPILED_STEPS: usize = 100_000;  // RFC §5.1
pub const MAX_PATCH_OPS: usize = 1_000;         // RFC §7.2
pub const MAX_PROMPT_TOKENS: usize = 16_384;    // RFC §3.3

// ================ Test Constants ================
pub const TEST_PRNG_SEED: u64 = 12345;
```

### レポート/系列パターン

実験結果の系列（lineage）を構造化して記録する：

```rust
pub struct ExperimentRecord {
    pub id: String,
    pub parent_id: Option<String>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub hypothesis: String,
    pub config: HashMap<String, f64>,
    pub results: ObservationalResult,
    pub interpretation: String,
    pub next_action: String,
}
```

出力形式（機械可読＋人間可読の両立）：

```json
{
  "id": "a1b2c3d4-...",
  "parent_id": "e5f6g7h8-...",
  "hypothesis": "TRUST_INHERIT_DECAY 0.70 -> 0.80 reduces convergence time 20%",
  "config": { "TRUST_INHERIT_DECAY": 0.80 },
  "results": { "mean": 0.687, "std": 0.042, "p50": 0.690, "p95": 0.742 },
  "interpretation": "Convergence speed 1.2x. Steady-state error within spec.",
  "next_action": "Test with 0.85"
}
```

## References

See skill: `rust-patterns` for comprehensive Rust idioms and patterns.
See `rules/darvium/observational-testing.md` for detailed observational testing patterns.
See `rules/darvium/simulation-runner.md` for simulation runner architecture.
See `rules/darvium/calibration-loop.md` for calibration methodology.
See `rules/darvium/public-api-design.md` for public API design principles.
