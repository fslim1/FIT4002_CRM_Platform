const RiskBenchmark = require('../models/RiskBenchmark')
const RiskWeightSetting = require('../models/RiskWeightSetting')
const {getDaysInStage, getDaysSinceActivity, getOverdueTaskCount, getOverdueTasks} = require('./riskFactors')
const {
    DEFAULT_INACTIVITY_THRESHOLDS,
    DEFAULT_STAGE_RISK_POINTS,
    DEFAULT_INACTIVITY_POINTS,
    DEFAULT_OVERDUE_TASK_POINTS,
    DEFAULT_LABEL_THRESHOLDS,
} = require('./defaultRiskWeights')

const SCORABLE_STAGES = ['Qualified', 'Contact Made', 'Demo Scheduled', 'Proposal Made', 'Negotiation']

const MANUAL_DEAL_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000

const getWeightSetting = async (companyKey, key, fallback) => {
    const doc = await RiskWeightSetting.findOne({companyKey, key})
    return doc ? doc.value : fallback
}

// client's overdue-task ruleset simplified:
//  - more than one overdue task -> High
//  - one High-priority task overdue by more than 3 days -> High
//  - one task overdue by 1-2 days -> Low
//  - anything else (single task, in between) -> Warning
const scoreOverdueTasks = (tasks, overdueTaskPoints) => {
    if (tasks.length === 0) return {points: 0, reason: null}

    if (tasks.length > 1) {
        return {points: overdueTaskPoints.highRisk, reason: `${tasks.length} overdue tasks linked to this deal`}
    }

    const task = tasks[0]
    const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(task.dueDate).getTime()) / (1000 * 60 * 60 * 24)))

    if (task.priority === 'High' && daysOverdue > 3) {
        return {points: overdueTaskPoints.highRisk, reason: `High-priority task overdue by ${daysOverdue} days`}
    }
    if (daysOverdue >= 1 && daysOverdue <= 2) {
        return {points: overdueTaskPoints.low, reason: `1 task overdue by ${daysOverdue} day${daysOverdue > 1 ? 's' : ''}`}
    }
    return {points: overdueTaskPoints.warning, reason: `1 task overdue by ${daysOverdue} days`}
}

// H7: combines H3/H4/H5's raw factors into one deterministic Low/Medium/High
// score, using the company's own benchmarks (H6) and weights.
const computeRiskScore = async (deal, companyKey, user) => {
    if (!SCORABLE_STAGES.includes(deal.stage)) {
        return {
            riskLevel: 'Low',
            points: 0,
            reasons: ['Deal is closed; risk scoring does not apply'],
            factors: {daysInStage: 0, daysSinceActivity: null, neverContacted: false, overdueTaskCount: 0},
        }
    }

    const ageMs = Date.now() - new Date(deal.createdAt).getTime()
    if (ageMs < MANUAL_DEAL_GRACE_PERIOD_MS) {
        const [daysSinceActivityResult, overdueTaskCount] = await Promise.all([
            getDaysSinceActivity(deal, user),
            getOverdueTaskCount(deal._id),
        ])
        return {
            riskLevel: 'Low',
            points: 0,
            reasons: ['Deal was created within the last 3 days — grace period applies'],
            factors: {
                daysInStage: getDaysInStage(deal),
                daysSinceActivity: daysSinceActivityResult.days,
                neverContacted: daysSinceActivityResult.neverContacted,
                overdueTaskCount,
            },
        }
    }

    const [daysSinceActivityResult, overdueTasks, stageWeights, inactivityThresholds, inactivityPoints, overdueTaskPoints, labelThresholds] =
        await Promise.all([
            getDaysSinceActivity(deal, user),
            getOverdueTasks(deal._id),
            getWeightSetting(companyKey, 'stageRiskPoints', DEFAULT_STAGE_RISK_POINTS),
            getWeightSetting(companyKey, 'inactivityThresholds', DEFAULT_INACTIVITY_THRESHOLDS),
            getWeightSetting(companyKey, 'inactivityPoints', DEFAULT_INACTIVITY_POINTS),
            getWeightSetting(companyKey, 'overdueTaskPoints', DEFAULT_OVERDUE_TASK_POINTS),
            getWeightSetting(companyKey, 'scoreLabelThresholds', DEFAULT_LABEL_THRESHOLDS),
        ])

    const daysInStage = getDaysInStage(deal)
    const {days: daysSinceActivity, neverContacted} = daysSinceActivityResult

    let points = 0
    const reasons = []

    const benchmark = await RiskBenchmark.findOne({companyKey, dealType: 'Standard', stage: deal.stage})
    if (benchmark) {
        if (daysInStage >= benchmark.highRiskMinDays) {
            points += stageWeights.highRisk
            reasons.push(`In "${deal.stage}" for ${daysInStage} days — past the ${benchmark.highRiskMinDays}-day high-risk trigger`)
        } else if (daysInStage > benchmark.healthyMaxDays) {
            points += stageWeights.warning
            reasons.push(`In "${deal.stage}" for ${daysInStage} days — beyond the ${benchmark.healthyMaxDays}-day healthy range`)
        }
    }

    if (neverContacted) {
        points += inactivityPoints.highRisk
        reasons.push('No interaction has ever been logged for this deal')
    } else if (daysSinceActivity >= inactivityThresholds.highRiskAtDays) {
        points += inactivityPoints.highRisk
        reasons.push(`No activity in ${daysSinceActivity} days — past the ${inactivityThresholds.highRiskAtDays}-day high-risk threshold`)
    } else if (daysSinceActivity >= inactivityThresholds.warningAtDays) {
        points += inactivityPoints.warning
        reasons.push(`No activity in ${daysSinceActivity} days — beyond the ${inactivityThresholds.warningAtDays}-day warning threshold`)
    }

    const overdueResult = scoreOverdueTasks(overdueTasks, overdueTaskPoints)
    if (overdueResult.points > 0) {
        points += overdueResult.points
        reasons.push(overdueResult.reason)
    }

    let riskLevel = 'Low'
    if (points >= labelThresholds.highMin) riskLevel = 'High'
    else if (points >= labelThresholds.mediumMin) riskLevel = 'Medium'

    if (reasons.length === 0) reasons.push('No risk factors detected')

    return {
        riskLevel,
        points,
        reasons,
        factors: {daysInStage, daysSinceActivity, neverContacted, overdueTaskCount: overdueTasks.length},
    }
}

module.exports = {computeRiskScore}