---
name: Simulation Runner
description: Darvium SimulationRunner の設計とマイルストーン別設定 -- Initialize -> Run N -> Collect -> Report -> Reset
---

# Simulation Runner

> SimulationRunner は Darvium 実験基盤の中核コンポーネント。
> N 回の反復実行を行い、統計的集計と実験レポートを生成する。

## SimulationRunner の設計

```
Initialize -> Run(xN) -> Collect -> Report -> Reset
                              |            |
                              |            +-- SimulationReport
                              |                (mean, std, quantiles)
                              |
                              +-- Vec<R> (raw measurements)
```

### 基本実装

```rust
use rand::rngs::StdRng;
use rand::SeedableRng;

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
            seed: 12345, // 標準固定シード
        }
    }

    pub fn with_seed(primitive: P, iterations: usize, seed: u64) -> Self {
        Self {
            primitive,
            iterations,
            results: Vec::with_capacity(iterations),
            seed,
        }
    }

    pub fn run(&mut self, input: &QueryRepresentation) -> &[R] {
        let mut rng = StdRng::seed_from_u64(self.seed);
        self.results.clear();
        for _ in 0..self.iterations {
            let result = self.primitive.search(input)
                .expect("FakeImpl should not fail");
            self.results.push(result.measure(&mut rng));
        }
        &self.results
    }

    pub fn report(&self) -> SimulationReport {
        let stats = Statistics::from(self.results.as_slice());
        SimulationReport {
            experiment_name: std::any::type_name::<P>(),
            n: self.results.len(),
            seed: self.seed,
            mean: stats.mean,
            std: stats.std,
            min: stats.min,
            max: stats.max,
            p1: stats.percentile(1),
            p5: stats.percentile(5),
            p25: stats.percentile(25),
            p50: stats.percentile(50),
            p75: stats.percentile(75),
            p95: stats.percentile(95),
            p99: stats.percentile(99),
        }
    }
}

pub struct SimulationReport {
    pub experiment_name: String,
    pub n: usize,
    pub seed: u64,
    pub mean: f64,
    pub std: f64,
    pub min: f64,
    pub max: f64,
    pub p1: f64,
    pub p5: f64,
    pub p25: f64,
    pub p50: f64,
    pub p75: f64,
    pub p95: f64,
    pub p99: f64,
}

impl std::fmt::Display for SimulationReport {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f,
            "=== Experiment: {} ===
             n={}, seed={}
             mean={:.4}, std={:.4}, min={:.4}, max={:.4}
             p1={:.4}, p5={:.4}, p25={:.4}, p50={:.4}, p75={:.4}, p95={:.4}, p99={:.4}
             Status: OBSERVED",
            self.experiment_name, self.n, self.seed,
            self.mean, self.std, self.min, self.max,
            self.p1, self.p5, self.p25, self.p50, self.p75, self.p95, self.p99)
    }
}
```

### Measurable トレイト

計測可能な任意の型を抽象化する：

```rust
pub trait Measurable {
    fn measure(&self, rng: &mut StdRng) -> f64;
}
```

## PortTrait 統合

SimulationRunner は任意の PortTrait 実装と連携する：

```rust
// FakeImpl を使った SimulationRunner の使用例
let fake = FakeRetrieval::new(CandidateSet::default());
let mut runner = SimulationRunner::new(fake, 10_000);
let results = runner.run(&query);
println!("{}", runner.report());
```

エラー注入 FakeImpl との連携：

```rust
let error_fake = FakeRetrievalAlwaysError;
let mut runner = SimulationRunner::new(error_fake, 100);
// エラー率 100% の分布を観測
```

## マイルストーン別設定

| マイルストーン | イテレーション数 | 目的 |
|---------------|-----------------|------|
| M-2 | 100 | 純粋インターフェーステスト、基本的な動作確認 |
| M-1.5 | 500 | 状態機械行き詰まりテスト |
| M-1 | 1,000 | FakeExecutor + FakeLlmClient 統合テスト |
| M-0.5 | 1,000 | PRNGノイズ注入、ランキングドリフト |
| M0 | 5,000 | 合成計画検証（統合動作） |
| M0.5 | 10,000 | プロパティベーステスト、不正形式注入 |
| M1+ | 10,000+ | feature gate integration_llm で隔離された大規模テスト |

### マイルストーン別テストの使用例

```rust
// tests/m_minus2/basic_retrieval.rs  (M-2: 100 iterations)
#[test]
fn fake_retrieval_smoke_test() {
    let fake = FakeRetrieval::new(fixtures::basic_candidate_set());
    let mut runner = SimulationRunner::new(fake, 100);
    runner.run(&fixtures::basic_query());
    println!("{}", runner.report());
}

// tests/m0/composition_test.rs  (M0: 5,000 iterations)
#[test]
fn workflow_composition_distribution() {
    let pipeline = FakePipeline::new();
    let mut runner = SimulationRunner::new(pipeline, 5_000);
    runner.run(&fixtures::complex_workflow());
    println!("{}", runner.report());
}
```

## References

See `rules/darvium/observational-testing.md` for observational testing patterns.
See `rules/darvium/calibration-loop.md` for calibration loop methodology.
See `rules/rust/patterns.md` SimulationRunner パターン for implementation patterns.
