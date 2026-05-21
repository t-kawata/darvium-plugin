---
ticket_id: <ID>
title: <TITLE>
slug: <SLUG>
status: draft
created_at: <DATE>
updated_at: <DATE>
---

# <TITLE>

## Summary

<!-- このチケットで達成することの簡潔な説明 -->

## Background

<!-- なぜこのチケットが必要か -->

## Scope

<!-- 何をするか -->

## Non-scope

<!-- 何をしないか -->

## Boy Scout Rule — 翻訳可能性計画

<!--
このチケットで触るコードに対して「来たときよりも美しく（翻訳可能に）」する計画を書く。
- 関数名/変数名が散文として読めるか
- 責務が混在している関数は分割すべきか
- ハードコード値を定数化すべきか
- コメントが「なぜ」を説明しているか
-->

## Acceptance Criteria

- [ ] 実装要件を満たしている
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストが通過している

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/{prefix}-{slug}/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/{prefix}-{slug}/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/{prefix}-{slug}/review.md（未作成、/review-ticket 全チェック通過後に作成）
