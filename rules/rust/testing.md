---
paths:
  - "**/*.rs"
---
# Rust Testing

> This file extends [common/testing.md](../common/testing.md) with Rust-specific content.

## Test Framework

- **`#[test]`** with `#[cfg(test)]` modules for unit tests
- **rstest** for parameterized tests and fixtures
- **proptest** for property-based testing
- **mockall** for trait-based mocking
- **`#[tokio::test]`** for async tests

## Test Organization

```text
my_crate/
├── src/
│   ├── lib.rs           # Unit tests in #[cfg(test)] modules
│   ├── auth/
│   │   └── mod.rs       # #[cfg(test)] mod tests { ... }
│   └── orders/
│       └── service.rs   # #[cfg(test)] mod tests { ... }
├── tests/               # Integration tests (each file = separate binary)
│   ├── api_test.rs
│   ├── db_test.rs
│   └── common/          # Shared test utilities
│       └── mod.rs
└── benches/             # Criterion benchmarks
    └── benchmark.rs
```

Unit tests go inside `#[cfg(test)]` modules in the same file. Integration tests go in `tests/`.

## Unit Test Pattern

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_user_with_valid_email() {
        let user = User::new("Alice", "alice@example.com").unwrap();
        assert_eq!(user.name, "Alice");
    }

    #[test]
    fn rejects_invalid_email() {
        let result = User::new("Bob", "not-an-email");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("invalid email"));
    }
}
```

## Parameterized Tests

```rust
use rstest::rstest;

#[rstest]
#[case("hello", 5)]
#[case("", 0)]
#[case("rust", 4)]
fn test_string_length(#[case] input: &str, #[case] expected: usize) {
    assert_eq!(input.len(), expected);
}
```

## Async Tests

```rust
#[tokio::test]
async fn fetches_data_successfully() {
    let client = TestClient::new().await;
    let result = client.get("/data").await;
    assert!(result.is_ok());
}
```

## Mocking with mockall

Define traits in production code; generate mocks in test modules:

```rust
// Production trait — pub so integration tests can import it
pub trait UserRepository {
    fn find_by_id(&self, id: u64) -> Option<User>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockall::predicate::eq;

    mockall::mock! {
        pub Repo {}
        impl UserRepository for Repo {
            fn find_by_id(&self, id: u64) -> Option<User>;
        }
    }

    #[test]
    fn service_returns_user_when_found() {
        let mut mock = MockRepo::new();
        mock.expect_find_by_id()
            .with(eq(42))
            .times(1)
            .returning(|_| Some(User { id: 42, name: "Alice".into() }));

        let service = UserService::new(Box::new(mock));
        let user = service.get_user(42).unwrap();
        assert_eq!(user.name, "Alice");
    }
}
```

## Test Naming

Use descriptive names that explain the scenario:
- `creates_user_with_valid_email()`
- `rejects_order_when_insufficient_stock()`
- `returns_none_when_not_found()`

## Coverage

- Target 80%+ line coverage
- Use **cargo-llvm-cov** for coverage reporting
- Focus on business logic — exclude generated code and FFI bindings

```bash
cargo llvm-cov                       # Summary
cargo llvm-cov --html                # HTML report
cargo llvm-cov --fail-under-lines 80 # Fail if below threshold
```

## 観測テストパラダイム (Observational Testing Paradigm)

**これはソフトウェアテストではない。これは自然科学・複雑系科学・統計学を基盤とした実験装置である。**
Darvium における「テスト」という語は慣習的な呼称であり、その実体は仮説駆動型の計算機実験。
アサーションは不変条件の検証に限定し、それ以外の振る舞いの評価は統計的観測で分析する。

### 目的
「テスト」の目的は「正しさの確認」ではなく「振る舞いの特徴付け」である。
不変条件（DAG性、状態遷移禁止、境界値超過）は `assert!` で検証するが、確率的要素を含む出力の評価は観測（統計的集計・分布出力）で行う。

### 出力形式
観測テストは `println!` で構造化テキストを `--nocapture` 経由で標準出力に書き出す：

```rust
// 観測テストの出力例
=== Experiment: trust_decay_calibration ===
Config: TRUST_INHERIT_DECAY=0.70, iterations=10000, seed=12345
Results:
  mean=0.687, std=0.042, min=0.512, max=0.743
  p25=0.661, p50=0.690, p75=0.718, p95=0.742, p99=0.743
  convergence_iters=147
Status: OBSERVED (no assertion)
Interpretation: Target steady-state [0.65, 0.70] achieved. Convergence within spec.
```

### サンプルサイズ基準
- 分布同定: n >= 10,000
- ドリフト検出: n >= 1,000
- 収束測定: n >= 500

### 固定シード PRNG
全ての確率的テストは固定シード PRNG を使用し、完全再現を保証する：

```rust
use rand::rngs::StdRng;
use rand::SeedableRng;

let mut rng = StdRng::seed_from_u64(12345);
// rng を使った全ての操作は再現可能
```

### アサーションと観測の使い分け

| 対象 | 方法 | 例 |
|------|------|-----|
| 不変条件（DAG性、禁止遷移） | `assert!` / `assert_eq!` | サイクル検出が常に真 |
| 境界値（予算上限、深さ上限） | `assert_eq!` エラー型一致 | `Err(SearchBudgetExceeded)` |
| エラー型の網羅性 | コンパイル時チェック | match の exhaustive |
| パラメータ感受性 | 観測（分布出力） | 減衰率変更時の収束速度変化 |
| ノイズ頑健性 | 観測（統計的集計） | ランキングドリフト分布 |
| 較正 | 観測（実験系列） | J(θ) 値の反復推移 |

## Fake-First 方法論

全ての外部依存は `PortTrait` として定義し、`FakeImpl` を本物より先に書く：

```rust
// 1. PortTrait の定義（src/ports.rs）
pub trait RetrievalPrimitive: Send + Sync {
    fn search(&self, query: &QueryRepresentation) -> Result<CandidateSet, RetrievalError>;
}

// 2. FakeImpl の定義（src/fakes.rs または tests/fakes.rs）
pub struct FakeRetrieval {
    deterministic_result: CandidateSet,
    call_count: Arc<AtomicUsize>,
}

impl FakeRetrieval {
    pub fn new(result: CandidateSet) -> Self {
        Self { deterministic_result: result, call_count: Arc::new(AtomicUsize::new(0)) }
    }
}

impl RetrievalPrimitive for FakeRetrieval {
    fn search(&self, _query: &QueryRepresentation) -> Result<CandidateSet, RetrievalError> {
        self.call_count.fetch_add(1, Ordering::SeqCst);
        Ok(self.deterministic_result.clone())
    }
}
```

原則：
- FakeImpl は決定論的でなければならない（隠れた乱数状態を持たない）
- コールカウンタ（`Arc<AtomicUsize>`）を付与し、意図しない呼び出しが発生していないことをテストで確認する
- エラー注入用の FakeImpl（`FakeRetrievalAlwaysError`）も用意する

## 固定シード PRNG テスト

全ての確率的テストは `StdRng::seed_from_u64(12345)` を標準シードとして統一する：

```rust
use rand::rngs::StdRng;
use rand::SeedableRng;

#[test]
fn ranking_drift_robustness() {
    let mut rng = StdRng::seed_from_u64(12345);

    // Gaussian ノイズ注入によるランキングドリフトテスト（1000 イテレーション）
    let mut top_selections = Vec::with_capacity(1000);
    for _ in 0..1000 {
        let noise: f64 = rng.sample(rand::distributions::StandardNormal);
        let drifted_score = 0.70 + noise * 0.05; // N(0.70, 0.05)
        top_selections.push(drifted_score);
    }

    // 出力（観測）— assert 不要、分布として観察
    println!("=== Ranking Drift Test ===");
    println!("samples={}, seed=12345", top_selections.len());
    // ... 統計集計と出力
}
```

## プロパティベーステスト (proptest)

不変条件の網羅的検証には proptest を使用する：

```rust
use proptest::prelude::*;

proptest! {
    #![proptest_config(ProptestConfig {
        cases: 1000,
        .. ProptestConfig::default()
    })]

    #[test]
    fn cycle_detection_catches_all_cycles(edges in prop::collection::vec(
        (0..100usize, 0..100usize), 1..50
    )) {
        let mut graph = WorkflowGraph::new();
        let has_cycle = detect_cycle(&graph);
        // 不変条件: サイクルがあれば必ず検出する
        assert!(has_cycle || !has_cycle_actual);
    }
}
```

## 決定論的リプレイ検証

同一入力 + 同一シードでビットレベル一致することを確認する：

```rust
#[test]
fn search_trace_deterministic_replay() {
    let seed = 12345u64;
    let trace1 = run_search_engine(MISSION_A, seed);
    let trace2 = run_search_engine(MISSION_A, seed);

    assert_eq!(
        trace1.hash(),
        trace2.hash(),
        "SearchTrace MUST be bit-identical across independent runs with same seed"
    );
}
```

このテストは特に M2.5-2 で要求されている。

## 較正ループ方法論

パラメータ調整は以下の実験サイクルで行う：

1. **仮説**: 「TRUST_INHERIT_DECAY を 0.70 → 0.80 に変更すると収束時間が20%短縮される」
2. **設定変更**: `src/constants.rs` の該当定数を変更
3. **テスト実行**: `cargo test --test m_minus1 -- --nocapture`
4. **観測記録**: 収束速度、定常誤差、CAS 競合率などを記録
5. **解釈**: 仮説と比較、効果量を計算
6. **記録**: 実験ID・親ID・結果・解釈を系列として保存
7. **反復**: 次の仮説に進む

各実験サイクルの結果は `rules/darvium/experiment-reporting.md` の形式に従って記録すること。

## マイルストーン別テスト構成

Darvium の13フェーズのテストは以下のディレクトリ構成に従う：

```text
tests/
├── m_minus2/       # M-2: 純粋インターフェース・境界値テスト
├── m_minus1_5/     # M-1.5: 状態機械行き詰まりテスト
├── m_minus1/       # M-1: FakeExecutor + FakeLlmClient
├── m_minus0_5/     # M-0.5: PRNGノイズ注入・ランキングドリフト
├── m0/             # M0: 合成計画検証
├── m0_5/           # M0.5: プロパティベース・不正形式注入
├── m1/             # M1: feature gate "integration_llm" で隔離
├── m1_5/
├── m2/
├── ...             # 以降はゲート付き
└── common/         # 共有テストユーティリティ、FakeImpl 集約
```

M2 に到達するまでは、ネットワークを切断した状態でも `cargo test` が 100% グリーンかつミリ秒単位で高速作動する状態を維持する。
M1+ のテストは `#[cfg(feature = "integration_llm")]` で隔離し、通常の `cargo test` では実行されない。

## References

See skill: `rust-testing` for comprehensive testing patterns including property-based testing, fixtures, and benchmarking with Criterion.
See `rules/darvium/observational-testing.md` for detailed observational testing patterns.
See `rules/darvium/simulation-runner.md` for simulation runner architecture.
See `rules/darvium/calibration-loop.md` for calibration loop methodology.
