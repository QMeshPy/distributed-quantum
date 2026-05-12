# Financial Modeling Foundations

Back to [Docs Index](README.md)

## Use this document when

- you need a precise definition of "financial modeling" before changing the finance workflow
- you need to decide whether the platform should target corporate-finance modeling or quantum-finance benchmarking
- you need to define the right dataset contract for a future finance API
- you need to separate CSV profiling from actual finance models

## 1. Why This Document Exists

The repository's finance workflow uses **QAOA-based portfolio optimization**: the user uploads a CSV of asset returns, the backend formulates a QUBO, runs the QAOA circuit, and returns both a quantum result and a classical (Simulated Annealing) comparison.

This document provides the theoretical grounding for that workflow and defines the boundary between:

- what kind of finance problem the platform is trying to solve
- what dataset shape that problem needs
- where classical analysis ends and where quantum computation begins

## 2. What Financial Modeling Actually Means

Financial modeling is a structured representation of a financial system or decision problem.

A real financial model normally contains all of the following:

- a business or investment question
- a defined input contract
- explicit assumptions
- equations, constraints, or scenario rules
- outputs that support valuation, forecasting, optimization, pricing, or risk decisions

This is different from:

- CSV ingestion
- schema inference
- exploratory profiling
- generic descriptive statistics

Those tasks can support a model, but they are not the model itself.

## 3. Two Major Tracks

In practice, the finance work relevant to this repo splits into two tracks.

### Track A: Corporate-Finance Modeling

This is the spreadsheet-oriented world used in investment banking, equity research, FP&A, private equity, and valuation work.

Typical questions:

- How will this company perform over the next 3 to 5 years?
- What is the company's intrinsic value?
- What happens under different revenue, margin, capex, or financing scenarios?
- What would an acquisition, IPO, or LBO look like?

Common model families:

- three-statement models
- DCF models
- M&A / accretion-dilution models
- LBO models
- IPO models
- sum-of-the-parts models
- consolidation models
- budget and forecasting models

Typical outputs:

- projected income statement, balance sheet, and cash flow statement
- valuation ranges
- sensitivity tables
- scenario comparisons
- debt capacity and financing schedules

Natural tools:

- Excel / spreadsheets
- accounting logic
- scenario modeling
- valuation formulas

Quantum fit:

- weak to indirect
- most of the workload is model construction, accounting logic, forecasting assumptions, and presentation
- some subproblems inside the workflow could be optimized, but the overall model is not naturally a circuit-first problem

### Track B: Quant-Finance / Quantum-Finance Benchmarking

This is the optimization-and-estimation world that maps more naturally to Qiskit and to explicit circuit generation.

Typical questions:

- Which assets should be selected under a budget and risk constraint?
- Which smaller set of assets best represents a larger market?
- What is the expected loss, VaR, or CVaR of a credit portfolio?
- What is the value of a fixed-income instrument or derivative under an uncertainty model?

Common model families:

- portfolio optimization
- portfolio diversification
- credit-risk analysis
- fixed-income pricing
- option pricing and related estimation problems

Typical outputs:

- selected asset sets or weights
- objective values and constraint satisfaction
- expected loss, VaR, CVaR
- price estimates and uncertainty intervals
- benchmark comparisons between classical and quantum methods

Natural tools:

- optimization formulations
- probability and uncertainty models
- time-series transforms
- QUBO / Ising mappings
- amplitude-estimation style workflows

Quantum fit:

- strong
- these problems often have a well-defined quantum-relevant core such as optimization or expectation estimation

## 4. Key Difference Between The Tracks

| Dimension | Track A: Corporate Finance | Track B: Quantum Finance |
| --- | --- | --- |
| Primary goal | Forecast, value, or explain a company | Optimize or estimate a finance problem |
| Typical unit of analysis | One company or transaction | Multi-asset portfolio, credit pool, instrument set |
| Data emphasis | Financial statements plus assumptions | Time series, similarities, probabilities, exposures, cash flows |
| Main model structure | Linked statements and schedules | Optimization or estimation problem |
| Typical runtime | Spreadsheet or standard Python analytics | Classical baseline plus optional quantum or hybrid solver |
| Good fit for circuit generation | Low | High |
| Best fit for this repo's distributed-quantum story | Secondary | Primary |

## 5. Are Financial Model Types Finite?

No single canonical finite list exists.

What is stable:

- the broad families are well understood
- professionals repeatedly build similar classes of models
- many training sources group those families into recognizable categories

What is not fixed:

- the exact taxonomy
- the naming conventions
- the boundary between one model type and another
- the number of subtypes once industry-specific variants are included

The right way to think about it is:

- the families are stable
- the exact type list is open-ended
- new variants emerge from new business questions, asset classes, and constraints

## 6. Can One Dataset Support Many Model Types?

Sometimes, but only within the same family and only if the dataset is rich enough.

### A single-company fundamentals dataset can support:

- historical ratio analysis
- scenario-based forecasting
- three-statement modeling
- DCF-style valuation if additional assumptions are provided

### A multi-asset price / return dataset can support:

- return estimation
- covariance estimation
- similarity estimation
- portfolio optimization
- portfolio diversification

### A loan / credit exposure dataset can support:

- expected loss modeling
- default distribution modeling
- VaR / CVaR estimation

### A fixed-income cash-flow dataset can support:

- rate-scenario pricing
- sensitivity analysis
- fixed-income valuation

What one dataset cannot usually do:

- serve as a universal source for every corporate-finance and quant-finance model at once

There is no single "master CSV" that naturally powers:

- company forecasting
- multi-asset portfolio optimization
- credit-risk estimation
- fixed-income pricing

without substantial additional data, assumptions, or transformation layers.

## 7. What A Good Dataset Looks Like

### 7.1 Corporate-Finance Dataset

Typical shape:

- one row per reporting period
- fields such as revenue, COGS, opex, capex, depreciation, tax, working-capital balances, debt, cash, shares
- additional assumption schedules for growth, margins, capex intensity, taxes, financing, and discount rates

Good example use:

- three-statement forecast
- DCF
- scenario analysis

### 7.2 Portfolio Dataset

Typical shape:

- one row per `date, ticker, price`
- or one row per `date, ticker, return`

Derived artifacts:

- mean return vector
- covariance matrix
- similarity matrix

Good example use:

- portfolio optimization
- portfolio diversification

### 7.3 Credit Dataset

Typical shape:

- one row per obligor or loan
- fields such as exposure at default, probability of default, loss given default, sector, factor loading, maturity

Derived artifacts:

- expected loss
- loss distribution
- VaR / CVaR

Good example use:

- credit-risk analysis

### 7.4 Fixed-Income Dataset

Typical shape:

- one row per instrument or per cash flow
- fields such as cash-flow date, cash-flow amount, curve point, tenor, factor loading

Derived artifacts:

- price under rate scenarios
- sensitivity to factors

Good example use:

- fixed-income pricing

## 8. What Quantum Computing Actually Does In Finance

Quantum computing does not make arbitrary spreadsheet work "quantum."

It becomes relevant when the finance problem has a quantum-suitable computational core.

The most practical cores today are:

- combinatorial optimization
- expectation estimation under uncertainty
- distribution and risk estimation

### Optimization-style path

Representative workflow:

1. start from structured finance inputs such as expected returns and covariance
2. define the optimization objective and constraints
3. convert the problem to a quadratic program or Ising-style form
4. solve it with a classical baseline and with a quantum or hybrid method

This is the natural fit for:

- portfolio optimization
- portfolio diversification

### Estimation-style path

Representative workflow:

1. build an uncertainty model
2. encode payoff or loss into a circuit objective
3. use amplitude-estimation style algorithms to estimate prices, expected losses, or risk measures

This is the natural fit for:

- credit-risk analysis
- fixed-income pricing
- options pricing

## 9. What This Means For The Repo

The current `backend` finance endpoint should be described as:

- CSV profiling
- finance data inspection
- schema and statistics summary

It should not be described as:

- professional-grade financial modeling
- DCF / valuation modeling
- quantum finance
- distributed quantum benchmark execution

That means the current implementation problem is not only algorithmic. It is also a product-language problem.

## 10. Recommendation For Product Direction

For this repository, the primary track should be:

- Track B: quant-finance / quantum-finance benchmarking

Why:

- the platform thesis is already centered on distributed quantum services
- the backend already has planner/runtime concepts that align with explicit circuit execution
- the strongest product differentiation is benchmarking a finance workload against classical computation
- Qiskit already provides concrete finance workflows that map to optimization or estimation problems

Track A should be treated as:

- a separate product idea
- a future analytics module
- or a data-preparation / reporting layer

but not as the main definition of the finance feature inside `backend`.

## 11. Recommended First Real Finance Problem

Start with:

- portfolio optimization

Why this is the best first target:

- the input contract is clear
- the classical baseline is straightforward
- the quantum path is well documented in Qiskit
- the result is easy to benchmark
- circuit generation is visible and explainable
- it aligns directly with the "distributed quantum vs classical" story

Recommended input contract:

- `date`
- `ticker`
- `adjusted_close` or `return`

Recommended backend stages:

1. validate the uploaded dataset
2. derive return series by ticker
3. compute expected returns and covariance matrix
4. build the optimization problem
5. run a classical reference solver
6. build and run the quantum or hybrid solve path
7. store both results with comparable metrics

Recommended outputs:

- selected assets
- objective value
- expected return
- variance / risk
- classical runtime
- quantum runtime
- circuit count
- qubit count
- solver metadata

## 12. API Direction For `backend`

The finance API should move from:

- one generic `submit CSV` route with implicit behavior

to:

- a model-specific contract with explicit `problem_type`

Suggested `problem_type` values:

- `profile`
- `portfolio_optimization`
- `portfolio_diversification`
- `credit_risk`
- `fixed_income_pricing`

Suggested product language:

- use `profile` for raw CSV inspection
- reserve `financial_model` for model-specific workflows
- reserve `quantum_finance` for workloads that actually produce optimization or estimation circuits

## 13. Practical Rule Of Thumb

Before implementing any new finance endpoint, answer these questions first:

1. What exact finance decision or estimation problem is being solved?
2. What dataset shape is required?
3. What assumptions are external to the dataset?
4. What is the classical baseline?
5. What part of the workflow is actually quantum?
6. What output proves value over a classical alternative?

If those questions are not answered, the feature is not ready to be called financial modeling.

## 14. References

- CFA Institute financial modeling overview:
  - https://www.cfainstitute.org/programs/cfa-program/candidate-resources/practical-skills-modules/financial-modeling
- CFI model taxonomy:
  - https://corporatefinanceinstitute.com/resources/financial-modeling/types-of-financial-models/
- CFI overview of what financial modeling is:
  - https://corporatefinanceinstitute.com/resources/financial-modeling/what-is-financial-modeling/
- Qiskit Finance tutorial index:
  - https://qiskit-community.github.io/qiskit-finance/tutorials/index.html
- Qiskit Finance portfolio optimization tutorial:
  - https://qiskit-community.github.io/qiskit-finance/tutorials/01_portfolio_optimization.html
- Qiskit Finance portfolio diversification tutorial:
  - https://qiskit-community.github.io/qiskit-finance/tutorials/02_portfolio_diversification.html
- Qiskit Finance credit risk tutorial:
  - https://qiskit-community.github.io/qiskit-finance/tutorials/09_credit_risk_analysis.html
- Qiskit Finance fixed-income tutorial:
  - https://qiskit-community.github.io/qiskit-finance/tutorials/08_fixed_income_pricing.html
- Qiskit Finance stock-market time-series tutorial:
  - https://qiskit-community.github.io/qiskit-finance/tutorials/11_time_series.html
- Qiskit Finance `PortfolioOptimization` API:
  - https://qiskit-community.github.io/qiskit-finance/stubs/qiskit_finance.applications.PortfolioOptimization.html
