---
name: Calibration Loop
description: Darvium パラメータ較正ループの方法論 -- 目的関数 J(theta)、ループ手順、実験系列管理
---

# Calibration Loop

> Darvium のパラメータ調整は科学的実験として設計される。
> 仮説 -> 設定変更 -> テスト実行 -> 観測 -> 解釈 -> 記録 -> 反復 のサイクルが完全なトレーサビリティを持つ。

## 目的関数 J(theta)

較正は目的関数 J(theta) の最適化として定式化する：

```
J(theta) = w1*M1(theta) + w2*M2(theta) + ... + wn*Mn(theta)
```

- theta: 較正対象パラメータのベクトル
- Mi(theta): i 番目の評価指標（収束速度、定常誤差、CAS競合率 etc.）
- wi: 各指標の重み（正規化済み、sum(wi) = 1）

### 評価指標の例

| 指標 | 定義 | 重み(例) |
|------|------|---------|
| 収束速度 | 定常状態に達するまでのイテレーション数（逆数で正規化） | 0.4 |
| 定常誤差 | 定常状態における目標値との平均絶対誤差 | 0.3 |
| CAS競合率 | 同時実行CAS操作の競合発生率 | 0.2 |
| メモリ使用量 | 最大同時使用ノード数の対数正規化値 | 0.1 |

目的関数の値域は [0.0, 1.0] で、**最大化**を目標とする。

## ループ手順

```
                +------------------------------------+
                |                                    |
                v                                    |
        +-------------+    +--------------+    +----------+
        | 1. 仮説    |--->| 2. 設定変更  |--->| 3. テスト|
        | (hypothesis)|    | (constants)  |    | cargo test|
        +-------------+    +--------------+    +-----+----+
                                                      |
        +-------------+    +--------------+    +------v----+
        | 6. 記録    |<---| 5. 解釈     |<---| 4. 観測  |
        | (log)       |    | (interpret)  |    | (observe)|
        +------+------+    +--------------+    +----------+
               |
               v
        +------+------+
        | 7. 反復    |
        | (iterate)  |
        +-------------+
```

### 詳細手順

#### 1. 仮説 (Hypothesis)
「theta を delta_theta だけ変更すると、J(theta) が delta_J 改善される」という予測を数値で明示する。

```
仮説例: TRUST_INHERIT_DECAY を 0.70 -> 0.80 に変更すると、
収束速度が 20% 向上し、J(theta) が 0.05 改善される。
```

#### 2. 設定変更
`src/constants.rs` の該当定数を変更する。変更は1回のループにつき**1変数**が原則。

```rust
// Before
pub const TRUST_INHERIT_DECAY: f64 = 0.70;

// After
pub const TRUST_INHERIT_DECAY: f64 = 0.80;
```

#### 3. テスト実行
```bash
cargo test --test <phase> -- --nocapture
```

#### 4. 観測
テスト出力の統計量を収集する。特に注目する値：
- **収束速度**: 定常状態に達するまでのイテレーション数
- **定常誤差**: 目標値との平均乖離
- **裾の重さ**: p95〜p99 の範囲（異常値の頻度）

#### 5. 解釈
数学的根拠に基づいて結果を解釈する：

```
解釈例:
- 収束速度: 123 iter -> 97 iter (21.1%改善、仮説20%に一致)
- 定常誤差: 0.023 -> 0.031 (許容範囲0.05以内)
- J(theta): 0.723 -> 0.758 (+0.035、仮説0.05に未達)
- 結論: 改善は確認されたが効果量は予測より小さい
```

#### 6. 記録
結果を実験系列として保存する（experiment-reporting.md の形式に従う）。

#### 7. 反復
次の仮説を立てて再実行。

## 実験系列フォーマット

各実験サイクルは以下の情報を系列（lineage）として記録する：

```json
{
  "experiment_id": "EXP-20260521-001",
  "parent_id": "EXP-20260520-015",
  "timestamp": "2026-05-21T14:30:00Z",
  "hypothesis": "TRUST_INHERIT_DECAY 0.70->0.80 で収束時間20%短縮",
  "config": {
    "TRUST_INHERIT_DECAY": 0.80,
    "previous": 0.70
  },
  "metrics": {
    "J_theta": { "before": 0.723, "after": 0.758, "delta": 0.035 },
    "convergence_iters": { "before": 123, "after": 97, "delta_pct": -21.1 },
    "steady_state_error": { "before": 0.023, "after": 0.031, "delta": 0.008 }
  },
  "interpretation": "収束速度21%改善、J(theta)改善0.035。",
  "next_action": "decay=0.85 で追加検証。または HUMAN_TRUST_K の調整を検討。"
}
```

## 較正対象分類

| 分類 | 対象 | 優先度 | フェーズ |
|------|------|--------|---------|
| 信頼伝播 | TRUST_INHERIT_DECAY, HUMAN_TRUST_K, SELF_CONF_DISCOUNT | 高 | M-1 |
| 時間減衰 | TEMPORAL_LAMBDA_USE, TEMPORAL_LAMBDA_VERIFY, TEMPORAL_ALPHA_BLEND | 高 | M-1 |
| 検索 | GED_BLEND_MARGIN, MAX_SEARCH_DEPTH, SEARCH_BUDGET | 中 | M0 |
| グラフ容量 | MAX_GRAPH_NODES, MAX_COMPILED_STEPS | 低 | M0.5 |
| パッチ | MAX_PATCH_OPS | 低 | M1 |

## References

See `rules/darvium/observational-testing.md` for observational test patterns.
See `rules/darvium/simulation-runner.md` for simulation infrastructure.
See `rules/darvium/experiment-reporting.md` for experiment report format and lineage management.
See `rules/darvium/rfc-governance.md` for RFC cross-reference requirements.
