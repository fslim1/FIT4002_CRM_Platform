// Pipeline stage colours, matching the Deal model's `stage` enum.
//
// The same palette is currently repeated in components/DealDetailModal.jsx
// (STAGE_COLORS) and pages/SalesPipeline.jsx (STAGES[].dot). The values agree
// today; this module exists so new code has one place to read them from, and so
// those two can be pointed here in a separate tidy-up rather than a third copy
// being added now.
export const STAGE_COLORS = {
    Qualified: '#A4A4A4',
    'Contact Made': '#F5C518',
    'Demo Scheduled': '#4DC9C9',
    'Proposal Made': '#F5A623',
    Negotiation: '#C0392B',
    Won: '#2ECC71',
    Lost: '#7F8C8D',
}

export const stageColor = (stage) => STAGE_COLORS[stage] || '#A4A4A4'
