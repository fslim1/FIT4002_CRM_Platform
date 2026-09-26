// Default scoring weights, used until an admin configures their own via
// RiskWeightSetting. Matches the client's Section 2 inactivity thresholds;
// the point values are a sensible starting rule set the admin can override
// (H7 AC1's "using that company's own configured weights").

const DEFAULT_INACTIVITY_THRESHOLDS = {warningAtDays: 8, highRiskAtDays: 15}
const DEFAULT_STAGE_RISK_POINTS = {warning: 2, highRisk: 4}
const DEFAULT_INACTIVITY_POINTS = {warning: 2, highRisk: 4}
// Based on client's overdue-task ruleset: severity is based
// on how many tasks are overdue, the overdue task's priority, and how many
// days overdue it is, rather than a flat per-task point.
const DEFAULT_OVERDUE_TASK_POINTS = {low: 1, warning: 2, highRisk: 4}
const DEFAULT_LABEL_THRESHOLDS = {mediumMin: 2, highMin: 4}

module.exports = {
    DEFAULT_INACTIVITY_THRESHOLDS,
    DEFAULT_STAGE_RISK_POINTS,
    DEFAULT_INACTIVITY_POINTS,
    DEFAULT_OVERDUE_TASK_POINTS,
    DEFAULT_LABEL_THRESHOLDS,
}