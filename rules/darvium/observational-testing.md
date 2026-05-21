---
name: Observational Testing
description: Darvium 観測テストパラダイムの詳細 -- 分布同定・収束測定・境界挙動・ドリフト検出
---

# Observational Testing

> **これはソフトウェアテストではない。これは複雑系科学の実験装置である。**
> Darvium の「テスト」という語は慣習的な呼称であり、その実体は仮説駆動型の計算機実験である。
> アサーションは実験の安全装置（不変条件の監視）に限定し、本質的な検証は統計的観測で行う。

## 観測テストの哲学

従来の TDD は「この入力に対してこの出力が出るべき」という決定論的検証に依存する。Darvium の世界では、同じ入力でも確率的要素により出力が分布を持つ。したがって：

- **アサーションは不変条件に限定**: DAG 非循環性、状態遷移の正当性、型安全性
- **それ以外は観測する**: 平均・分散・分位数・分布形状の変化を追跡する
- **観測結果は解釈される**: 数学的根拠に基づいて「許容範囲内」か「異常」かを判断する
- **解釈は記録される**: 実験系列（lineage）として保存し、後続の較正に利用する

## 観測テストの種類

### 1. 分布同定 (Distribution Identification)

目的：出力値の統計的分布を特徴付ける。

```rust
#[cfg(test)]
mod distribution_tests {
    use super::*;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    #[test]
    fn trust_score_distribution() {
        let mut rng = StdRng::seed_from_u64(12345);
        let mut scores = Vec::with_capacity(10_000);

        for _ in 0..10_000 {
            let score = simulate_trust_propagation(&mut rng);
            scores.push(score);
        }

        let stats = Statistics::from(&scores);
        println!("=== Distribution: trust_score ===");
        println!("n={}, mean={:.4}, std={:.4}", scores.len(), stats.mean, stats.std);
        println!("p1={:.4}, p5={:.4}, p25={:.4}, p50={:.4}, p75={:.4}, p95={:.4}, p99={:.4}",
            stats.percentile(1), stats.percentile(5),
            stats.percentile(25), stats.percentile(50),
            stats.percentile(75), stats.percentile(95), stats.percentile(99));
        println!("Status: OBSERVED (no assertion)");
    }
}
```

### 2. 収束測定 (Convergence Measurement)

目的：パラメータ変更時の収束速度・定常状態を測定する。

```rust
#[test]
fn convergence_rate_measurement() {
    let mut rng = StdRng::seed_from_u64(12345);
    let mut values = Vec::with_capacity(500);

    for i in 0..500 {
        let v = simulate_convergence_step(&mut rng, i);
        values.push(v);
    }

    // 収束点の検出（デルタ < 0.001 が100ステップ継続）
    let convergence_iter = values.windows(100)
        .position(|w| w.iter().all(|&v| (v - w[0]).abs() < 0.001));

    println!("=== Convergence Test ===");
    println!("convergence_at={:?}", convergence_iter);
    println!("final_value={:.4}", values.last().unwrap());
    println!("Status: OBSERVED (no assertion)");
}
```

### 3. 境界挙動 (Boundary Behavior)

目的：パラメータの境界値における挙動の変化を観測する。

```rust
#[rstest]
#[case(0.50)]
#[case(0.70)]
#[case(0.90)]
#[case(0.99)]
fn boundary_trust_decay(#[case] decay: f64) {
    let mut rng = StdRng::seed_from_u64(12345);
    let mut results = Vec::with_capacity(1_000);

    for _ in 0..1_000 {
        let score = simulate_with_decay(decay, &mut rng);
        results.push(score);
    }

    let stats = Statistics::from(&results);
    println!("=== Boundary Test: decay={} ===", decay);
    println!("mean={:.4}, std={:.4}, p50={:.4}, p95={:.4}", stats.mean, stats.std, stats.percentile(50), stats.percentile(95));
    println!("Status: OBSERVED");
}
```

### 4. ドリフト検出 (Drift Detection)

目的：パラメータ変更前後での分布変化を定量化する。

```rust
#[test]
fn parameter_drift_detection() {
    let mut rng = StdRng::seed_from_u64(12345);

    // 変更前の分布
    let baseline = simulate_with_config(0.70, &mut rng);
    // 変更後の分布
    let drifted = simulate_with_config(0.80, &mut rng);

    let baseline_stats = Statistics::from(&baseline);
    let drifted_stats = Statistics::from(&drifted);
    let shift = drifted_stats.mean - baseline_stats.mean;

    println!("=== Drift Detection ===");
    println!("baseline_mean={:.4}, drifted_mean={:.4}", baseline_stats.mean, drifted_stats.mean);
    println!("shift={:.4} (effect_size={:.4})", shift, shift / baseline_stats.std);
    println!("Status: OBSERVED");
}
```

## 統計的要求

### サンプルサイズ基準

| 目的 | 最小サンプルサイズ | 備考 |
|------|-------------------|------|
| 分布同定 | n >= 10,000 | 分位数の安定推定に必要 |
| ドリフト検出 | n >= 1,000 | 効果量の検出に必要 |
| 収束測定 | n >= 500 | 定常状態の確認に必要 |
| 境界挙動 | n >= 1,000 | 境界近傍の分散増加に対応 |

### 出力すべき統計量

全ての観測テストは以下の統計量を `println!` で構造化出力する：

- `n`: サンプルサイズ
- `mean`: 平均
- `std`: 標準偏差
- `min`, `max`: 最小値・最大値
- `p25`, `p50`, `p75`: 四分位数
- `p5`, `p95`: 90%区間
- `p1`, `p99`: 98%区間

### 出力形式

全ての観測テスト出力は以下のテンプレートに従う：

```text
=== Experiment: <experiment_name> ===
Config: <key=value, ...>
Results:
  n=<count>, mean=<float>, std=<float>, min=<float>, max=<float>
  p1=<float>, p5=<float>, p25=<float>, p50=<float>, p75=<float>, p95=<float>, p99=<float>
  [additional metrics...]
Interpretation: <自由記述、数学的根拠に基づく解釈>
Status: OBSERVED
```

## アサーションと観測の使い分け基準

| 対象 | 方法 | 例 |
|------|------|-----|
| DAG 非循環性 | assert! | サイクル検出が常に真 |
| 状態遷移の正当性 | assert_eq! エラー型 | Err(TerminalStateViolation) |
| 型安全性 | コンパイル時 | コンパイルが通ること |
| 予算超過 | assert_eq! エラー型 | Err(SearchBudgetExceeded) |
| エラー型網羅性 | match exhaustive | コンパイル時保証 |
| パラメータ感受性 | 観測のみ | 減衰率変更時の収束速度変化 |
| ノイズ頑健性 | 観測のみ | ランキングドリフト分布 |
| 較正値の適切性 | 観測のみ | J(theta) 値の反復推移 |
| 分布形状 | 観測のみ | 正規性・裾の重さ |

## 固定シード PRNG

全ての確率的テストは `StdRng::seed_from_u64(12345)` を使用する。これにより：

- テスト実行ごとにビットレベルで同一の結果が得られる
- CI 環境での再現性が保証される
- シード変更による分布変化の観測が可能（感度分析用に別シードで再実行）

```rust
use rand::rngs::StdRng;
use rand::SeedableRng;

let mut rng = StdRng::seed_from_u64(12345);
```

## 決定論的リプレイ検証

同一入力＋同一シードでビットレベル一致することを確認するテストを含める：

```rust
#[test]
fn deterministic_replay() {
    let seed = 12345u64;
    let trace1 = run_search_engine(MISSION_A, seed);
    let trace2 = run_search_engine(MISSION_A, seed);

    assert_eq!(
        trace1.hash(),
        trace2.hash(),
        "SearchTrace MUST be bit-identical with same input and seed"
    );
}
```

## References

See `rules/rust/testing.md` for testing infrastructure and tooling.
See `rules/darvium/simulation-runner.md` for simulation runner patterns.
See `rules/darvium/calibration-loop.md` for calibration loop methodology.
See `rules/darvium/experiment-reporting.md` for experiment report formats.
