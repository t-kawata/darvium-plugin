---
name: Experiment Reporting
description: Darvium 実験結果のレポート構造と系列追跡 -- 機械可読/人間可読形式の両立
---

# Experiment Reporting

> 全ての実験結果は機械可読（JSON）と人間可読（Markdown）の両形式で記録される。
> 系列（lineage）による完全なトレーサビリティを持つ。

## レポート構造

各実験レポートは以下のセクションで構成される：

```json
{
  "metadata": {
    "experiment_id": "EXP-20260521-001",
    "parent_id": "EXP-20260520-015",
    "timestamp": "2026-05-21T14:30:00Z",
    "phase": "M-1",
    "experimenter": "claude"
  },
  "hypothesis": {
    "statement": "TRUST_INHERIT_DECAY 0.70 -> 0.80 で収束時間20%短縮",
    "predicted_J_delta": 0.05,
    "rationale": "減衰率増加により信頼伝播が加速するため"
  },
  "config": {
    "changed_parameters": {
      "TRUST_INHERIT_DECAY": 0.80
    },
    "previous_values": {
      "TRUST_INHERIT_DECAY": 0.70
    },
    "fixed_parameters": {
      "HUMAN_TRUST_K": 0.08,
      "SELF_CONF_DISCOUNT": 0.85
    }
  },
  "results": {
    "raw_statistics": {
      "n": 10000,
      "mean": 0.687,
      "std": 0.042,
      "min": 0.512,
      "max": 0.743,
      "p1": 0.523,
      "p5": 0.601,
      "p25": 0.661,
      "p50": 0.690,
      "p75": 0.718,
      "p95": 0.742,
      "p99": 0.743
    },
    "derived_metrics": {
      "convergence_iters": 97,
      "steady_state_error": 0.031,
      "J_theta": 0.758
    }
  },
  "comparison": {
    "baseline_J_theta": 0.723,
    "observed_J_delta": 0.035,
    "predicted_vs_observed": "observed < predicted (-0.015)",
    "effect_size": 0.83
  },
  "interpretation": {
    "summary": "収束速度21.1%改善。J(theta) 改善0.035。効果量大 (d=0.83)。",
    "confidence": "medium",
    "anomalies": []
  },
  "next_actions": [
    {
      "action": "decay=0.85 で追加検証",
      "rationale": "J(theta) が未だ単調増加傾向にあるため"
    },
    {
      "action": "HUMAN_TRUST_K の調整も検討",
      "rationale": "減衰率単独では限界が見え始めている"
    }
  ]
}
```

## 人間可読形式（Markdown）

実験系列の人間可読なサマリは以下の形式で出力する：

```markdown
## 実験: EXP-20260521-001
**親実験**: EXP-20260520-015 | **フェーズ**: M-1

### 仮説
TRUST_INHERIT_DECAY 0.70 -> 0.80 で収束時間20%短縮、J(theta) 0.05改善を予測。

### 設定変更
| パラメータ | 変更前 | 変更後 |
|-----------|--------|--------|
| TRUST_INHERIT_DECAY | 0.70 | 0.80 |

### 結果（n=10,000）
| 指標 | 変更前 | 変更後 | 変化率 |
|------|--------|--------|--------|
| 収束速度(iter) | 123 | 97 | -21.1% |
| 定常誤差 | 0.023 | 0.031 | +34.8% |
| J(theta) | 0.723 | 0.758 | +4.8% |

**効果量**: d=0.83 (大きい)

### 解釈
- 仮説「収束速度20%改善」はほぼ達成（21.1%）
- J(theta) 改善0.035は予測0.05に及ばず
- 定常誤差が増加傾向 -> トレードオフの可能性

### 次のアクション
1. decay=0.85 で追加検証
2. HUMAN_TRUST_K の調整も検討（減衰率との相互作用）
```

## 系列追跡

実験系列はチェーンとして管理され、各実験は単一の親を持つ：

```text
EXP-20260501-001 (初期較正)          <- ルート
+-- EXP-20260501-002 (decay 0.70->0.75)
|   +-- EXP-20260502-003 (decay 0.75->0.80)
|       +-- EXP-20260521-001 (decay 0.80->0.85)  <- 現在
+-- EXP-20260501-004 (K 0.08->0.10)
    +-- EXP-20260503-005 (K 0.10->0.12)
```

### 系列管理ルール

1. **1操作=1実験**: 1回の較正ループで変更するパラメータは1つ
2. **branch は parent_id で表現**: 分岐した系列は parent_id で追跡
3. **実験IDのフォーマット**: `EXP-YYYYMMDD-NNN`（日付 + 3桁連番）
4. **全ての実験を記録**: 成功・失敗・予想外の結果にかかわらず全て保存
5. **分析後は次のアクションを明記**: 「何もしない（較正完了）」も有効な次のアクション

## ファイル保存

実験レコードは以下のパスに保存する（`$DARVIUM_ROOT` は `contexts/dev.md` の定数、Darvium crate ルートを示す）：

```text
$DARVIUM_ROOT/experiments/
+-- EXP-YYYYMMDD-NNN.json      # 機械可読（完全データ）
+-- EXP-YYYYMMDD-NNN.md        # 人間可読（サマリ）
+-- series/                     # 系列表示用
    +-- trust_propagation.md
    +-- temporal_decay.md
    +-- search_params.md
```

## References

See `rules/darvium/calibration-loop.md` for calibration methodology and objective functions.
See `rules/darvium/observational-testing.md` for observational testing patterns.
See `rules/darvium/simulation-runner.md` for simulation infrastructure.
