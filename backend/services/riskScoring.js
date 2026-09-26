const RiskBenchmark = require('../models/RiskBenchmark')
const RiskWeightSetting = require('../models/RiskWeightSetting')
const {getDaysInStage, getDaysSinceActivity, getOverdueTaskCount} = require('./riskFactors')
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

    const [daysSinceActivityResult, overdueTaskCount, stageWeights, inactivityThresholds, inactivityPoints, overdueTaskPoints, labelThresholds] =
        await Promise.all([
            getDaysSinceActivity(deal, user),
            getOverdueTaskCount(deal._id),
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

    if (overdueTaskCount > 0) {
        points += overdueTaskPoints
        reasons.push(`${overdueTaskCount} overdue task${overdueTaskCount > 1 ? 's' : ''} linked to this deal`)
    }

    let riskLevel = 'Low'
    if (points >= labelThresholds.highMin) riskLevel = 'High'
    else if (points >= labelThresholds.mediumMin) riskLevel = 'Medium'

    if (reasons.length === 0) reasons.push('No risk factors detected')

    return {
        riskLevel,
        points,
        reasons,
        factors: {daysInStage, daysSinceActivity, neverContacted, overdueTaskCount},
    }
}

module.exports = {computeRiskScore}