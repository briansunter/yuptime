# Domain context

## Monitor

A Kubernetes custom resource that declares one target, its check schedule, and
its alerting policy. The controller treats `spec` as read-only and publishes
runtime state only through `status`.

## Schedule slot

One immutable due time in a Monitor's periodic sequence. Schedule slots are
derived from the Monitor creation time, initial delay, deterministic phase
offset, and interval. Completion time never changes future slots.

## Check run

The logical evaluation of one Monitor for one schedule slot. A run can contain
multiple attempts according to retry policy, but only one final result is
published.

## Check attempt

One bounded invocation of a checker implementation. An attempt has its own
start time, deadline, cancellation signal, and structured result.

## Check Engine

The controller module that owns Monitor registration, schedule slots,
admission, coalescing, retries, cancellation, and ordered result publication.

## Checker sidecar

The persistent container in the Yuptime Pod that supervises a fixed pool of
long-lived checker worker processes. It executes attempts but does not schedule
runs or write Monitor status.

## Result publication

The ordered controller operation that writes a final run result to Monitor
status and then updates metrics and alert transitions. Older schedule slots or
stale Monitor generations cannot overwrite newer results.
