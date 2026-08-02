# Role execution limits and pricing

Status: active M4 backend design and contract.

This document defines the product meaning of per-role execution limits. It is
the handoff authority for the OrganizationSpec field, Runtime execution
snapshots, budget accounting, and frontend display. It deliberately keeps
provider-specific enforcement behind the Runtime adapter boundary.

## Scope

An organization role may declare three optional limits for one execution
attempt:

```json
{
  "execution_limits": {
    "max_tokens_per_attempt": 50000,
    "max_cost_usd_per_attempt": "0.50",
    "max_runtime_seconds_per_attempt": 900
  }
}
```

The field is part of the immutable `OrganizationSpec` version. The user can
set the three limits while drafting a proposal; the frontend cannot set or
change model prices. Omitting a field means that the applicable platform
default or provider policy remains in force. Omitting all fields preserves the
existing behavior.

V1 fixes the scope to one Assignment execution attempt. A technical retry and a
business replay create a new attempt with a fresh single-attempt allowance.
Historical attempts and their costs remain immutable and are shown separately.

## Limit semantics

The limits are independent safety fuses and are evaluated together:

- `max_tokens_per_attempt` is a hard upper bound on observed total tokens. The
  total includes input, cached input, output, and reasoning tokens according to
  the provider's normalized usage. Reasoning tokens are already included in
  `output_tokens`; they must not be added a second time.
- `max_cost_usd_per_attempt` is a product cost estimate in USD, not a promise
  about a relay provider's invoice. The product computes it from its immutable
  price catalog and the normalized usage. Where a provider cannot report a
  component, the product uses a conservative estimate or reports the cost as
  unavailable; it never invents a precise value.
- `max_runtime_seconds_per_attempt` is wall-clock time from Runtime admission
  to terminal completion. Queue time is not charged to this limit. The product
  deadline is additionally capped by the platform hard deadline.

The effective enforcement values are the minimum of the role limit (when
present), the platform hard limit, the provider limit, and any remaining global
Runtime budget. The first fuse reached interrupts the exact managed Runtime
Turn when the provider supports interruption, then persists a terminal,
retryable failure. Providers that only expose a blocking request are bounded by
their adapter timeout and are evaluated immediately after the response.

## Price catalog

The backend owns a versioned, hard-coded product price catalog. There is no
public write endpoint for prices. V1 uses OpenAI Standard API prices per one
million tokens, retrieved on 2026-08-02; the GPT-5.6 Terra and Luna prices
reflect the July 30, 2026 adjustment.

| Model | Short input | Short cached input | Short cache write | Short output | Long input | Long cached input | Long cache write | Long output |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `gpt-5.6-sol` | 5.00 | 0.50 | 6.25 | 30.00 | 10.00 | 1.00 | 12.50 | 45.00 |
| `gpt-5.6-terra` | 2.00 | 0.20 | 2.50 | 12.00 | 4.00 | 0.40 | 5.00 | 18.00 |
| `gpt-5.6-luna` | 0.20 | 0.02 | 0.25 | 1.20 | 0.40 | 0.04 | 0.50 | 1.80 |
| `gpt-5.5` | 5.00 | 0.50 | unavailable | 30.00 | 10.00 | 1.00 | unavailable | 45.00 |

The catalog version is `openai-standard-2026-07-30`. A prompt with more than
272,000 input tokens uses the long-context rates for the full request. GPT-5.6
cache writes are billed at 1.25 times the uncached input rate. The source of
truth is the official [OpenAI pricing page](https://developers.openai.com/api/docs/pricing)
and the [July 2026 changelog](https://developers.openai.com/api/docs/changelog).

Prices are stored as decimal strings or integer micro-USD values. Python
`float` is not used for accounting. The calculated amount is rounded half-up
to six decimal places for persistence and display.

## Cost formula

For a known price snapshot:

```text
cache_write_input = min(cache_write_tokens, input_tokens - cached_input_tokens)
uncached_input = max(
  input_tokens - cached_input_tokens - cache_write_input,
  0
)
cost =
  cached_input_tokens * cached_input_price
  + uncached_input * input_price
  + cache_write_input * cache_write_price
  + output_tokens * output_price
```

`output_tokens` already includes reasoning tokens. If a GPT-5.6 provider does
not expose `cache_write_tokens`, the product conservatively prices the
uncached input portion at the cache-write rate. If the model has no separate
cache-write rate, it uses the normal input rate. This is marked as an
estimated/conservative calculation in the execution record.

If the provider returns no usable usage, `usage_status` remains
`unavailable`, `cost_status` is `unavailable`, and `cost_usd` is null. The
existing conservative Token reservation still protects the global budget.

If a dollar limit is requested but the selected model has no catalog entry, the
product blocks Runtime admission with a structured pricing-unavailable reason.
Token-only and time-only limits remain usable. A Dify binding may use the USD
limit only when its operator-supplied model is catalogued and the workflow
reports usage; a Dify workflow's own vendor invoice is not silently represented
as OpenAI cost.

## Persistence and replay

At Runtime admission the product writes an execution snapshot containing:

- the three role limits;
- the effective Token and wall-clock limits;
- the catalog version, model, context class, and unit prices;
- observed usage, `cost_usd`, and `cost_status`.

Changing a later OrganizationSpec version, Runtime binding, or price catalog
does not mutate a prior snapshot. A replay reads the selected OrganizationSpec
version and receives the same declared role limits, but it has a new snapshot
and a new cost line.

## API and frontend boundary

The OrganizationSpec response is authoritative for role settings. Runtime and
Task responses expose the effective limits, observed usage, cost status, and
cost amount. The frontend may render and submit role limit values and display
the backend-calculated estimate. It must not calculate prices, send unit rates,
or provide an admin price-editing control.

Recommended display labels:

- “Token 上限：50,000 / 本次消耗：12,400”
- “费用上限：$0.50 / 估算费用：$0.183200”
- “最长运行：15 分钟 / 实际运行：3 分 12 秒”

When usage or pricing is unavailable, display “费用暂不可用” rather than
`$0` or a guessed amount.

## Non-goals

V1 does not implement account billing, provider invoice reconciliation,
monthly organization budgets, user-editable price tables, per-tool prices, or
cross-attempt aggregation as an enforcement scope. Those require a separate
commercial and accounting decision.
