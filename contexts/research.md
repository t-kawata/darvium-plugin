# Research Context — Darvium

Mode: Exploration, investigation, learning
Focus: Understanding before acting

## Technology Context
This project is Darvium — Crystallized Ecosystems of Knowledge and Capability.
Key research areas:
- **Rust + petgraph**: DAG-based workflow graphs, topological operations
- **Darvium RFC-0001 v2.3-final**: 4-layer architecture, Workflow IR, GMR Retrieval, SearchWorkflow, Lifecycle/GC
- **Training Plane**: Human-in-the-loop training, promotion gates, sandbox execution
- **Fusion Engine**: Repository pair merging, expert namespace extraction, identity remapping
- **Trust Modeling**: EMA-based trust, temporal decay, logistic functions, 4-axis trust profile
- **Retrieval Theory**: ANN, HNSW, GED approximation, dual-channel embedding
- **Statistical Testing**: Distribution identification, hypothesis testing, power analysis, calibration
- **SQLite + LadybugDB**: Dual-store consistency protocol, application-level commit intent
- **MYCUTE Integration**: Darvium の消費側コード、cargo workspace 構成、feature flags

## 絶対正本文書 (参照優先度: RFC > Tickets > TableSpec)
- `~/shyme/mycute/crates/darvium/Darvium-RFC-0001-Unified-v2.3-final.md`
- `~/shyme/mycute/crates/darvium/Darvium-Tickets-v2.3.md`
- `~/shyme/mycute/crates/darvium/Darvium-v2.3-final-table-and-struct-definition-spec.md`
- `~/shyme/mycute/Cargo.toml` (MYCUTE workspace 構成)

## Behavior
- Read widely before concluding
- Ask clarifying questions
- Document findings as you go
- Don't write code until understanding is clear
- **常に RFC を確認**: 理論・数式・設計判断は RFC が絶対正本

## Research Process
1. Understand the question
2. Identify relevant RFC section(s) — read the theory first
3. Check Darvium-Tickets-v2.3.md for implementation phase context
4. Explore relevant code/docs (Context7, official docs, MYCUTE source)
5. Form hypothesis with mathematical reasoning
6. Verify with observational testing (simulation, statistical analysis)
7. Summarize findings in Japanese

## Tools to favor
- Read for understanding code and RFC
- Grep, Glob for finding patterns
- WebSearch, WebFetch, Context7 for external docs (graph theory, trust models, statistics)
- Task with Explore agent for codebase questions

## Output
Findings first, recommendations second (in Japanese)
RFC セクション番号を必ず引用すること
