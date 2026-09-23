import {stageColor} from './dealStages'

// The graph's visual language.
//
// Every node kind differs in BOTH shape and colour. Resting the distinction on
// hue alone would fail for a colour-blind viewer or a greyscale print, so shape
// carries the same information.

const FONT = "'Inter', system-ui, sans-serif"

const INK = '#232528'
const HALO = '#FFFFFF'

export const NODE_KINDS = [
    {kind: 'company', label: 'Company', shape: 'round-rectangle', color: '#253984'},
    {kind: 'contact', label: 'Contact', shape: 'ellipse', color: '#2F8F9D'},
    // Deal nodes take their fill from the pipeline stage, so the legend shows a
    // neutral swatch and the stage colours speak for themselves on the graph.
    {kind: 'deal', label: 'Deal', shape: 'diamond', color: '#8B9199'},
    {kind: 'salesperson', label: 'Salesperson', shape: 'triangle', color: '#6B4E9B'},
]

// Connection strength. The API returns the band thresholds and their wording
// in meta.bands; this is only how each one is drawn.
export const BAND_STYLES = {
    none: {width: 1, color: '#9CA3AF', lineStyle: 'dashed'},
    some: {width: 2.5, color: '#5B8DEF', lineStyle: 'solid'},
    frequent: {width: 5, color: '#253984', lineStyle: 'solid'},
}

export const FOCUS_RING = '#F5A623'

// A large account draws every name on top of its neighbours and the graph stops
// being readable. Past this many nodes, names are held back until the viewer
// zooms in or points at something, so the shape of the account stays legible.
export const DENSE_NODE_COUNT = 40
export const LABEL_ZOOM = 0.85

// Two lines per node: what it is, then how it is doing. Cytoscape honours the
// newline when text-wrap is 'wrap'.
const displayLabel = (data) => {
    if (data.kind === 'contact') {
        return data.subtitle ? `${data.label}\n${data.subtitle}` : data.label
    }
    if (data.kind === 'deal') {
        return data.stage ? `${data.label}\n${data.stage}` : data.label
    }
    return data.label
}

// Turns an API response into the array Cytoscape consumes, adding the two
// derived fields the stylesheet reads.
export const toElements = (graph) => {
    if (!graph) return []

    const nodes = (graph.nodes || []).map((node) => ({
        data: {
            ...node.data,
            displayLabel: displayLabel(node.data),
            stageColor: node.data.kind === 'deal' ? stageColor(node.data.stage) : undefined,
        },
    }))

    return [...nodes, ...(graph.edges || [])]
}

export const graphStylesheet = [
    {
        selector: 'node',
        style: {
            label: 'data(displayLabel)',
            'font-family': FONT,
            'font-size': 12,
            'font-weight': 500,
            color: INK,
            'text-wrap': 'wrap',
            'text-max-width': 132,
            'text-valign': 'bottom',
            'text-halign': 'center',
            // Enough clearance that a two-line label does not sit on top of the
            // edges running into its own node.
            'text-margin-y': 7,
            // Keeps labels readable wherever they fall over an edge.
            'text-outline-width': 2.5,
            'text-outline-color': HALO,
            'text-outline-opacity': 0.9,
            width: 26,
            height: 26,
            'border-width': 0,
            'transition-property': 'opacity',
            'transition-duration': '120ms',
        },
    },
    {
        selector: 'node[kind = "company"]',
        style: {
            shape: 'round-rectangle',
            'background-color': '#253984',
            // The company name sits inside its own block rather than below it.
            width: 'label',
            height: 'label',
            padding: 12,
            'text-valign': 'center',
            'text-margin-y': 0,
            color: '#FFFFFF',
            'font-size': 13,
            'font-weight': 700,
            'text-outline-width': 0,
            'text-max-width': 180,
        },
    },
    {
        selector: 'node[kind = "contact"]',
        style: {shape: 'ellipse', 'background-color': '#2F8F9D', width: 32, height: 32},
    },
    {
        // A relationship that has gone quiet is visible without hovering.
        selector: 'node[kind = "contact"][band = "none"]',
        style: {
            'background-color': '#BFD3D6',
            'border-width': 2,
            'border-color': '#9CA3AF',
            'border-style': 'dashed',
        },
    },
    {
        // The contact whose profile the panel was opened from.
        selector: 'node[?isFocus]',
        style: {'border-width': 4, 'border-color': FOCUS_RING, 'border-style': 'solid'},
    },
    {
        selector: 'node[kind = "deal"]',
        style: {
            shape: 'diamond',
            'background-color': 'data(stageColor)',
            width: 38,
            height: 38,
        },
    },
    {
        selector: 'node[kind = "salesperson"]',
        style: {
            shape: 'triangle',
            'background-color': '#6B4E9B',
            width: 28,
            height: 28,
            'font-size': 11,
        },
    },

    {
        selector: 'edge',
        style: {
            'curve-style': 'bezier',
            'line-color': '#A0AEC0',
            width: 2,
            'target-arrow-shape': 'none',
            'transition-property': 'opacity',
            'transition-duration': '120ms',
        },
    },
    ...Object.entries(BAND_STYLES).map(([band, {width, color, lineStyle}]) => ({
        selector: `edge[kind = "employs"][band = "${band}"]`,
        style: {width, 'line-color': color, 'line-style': lineStyle},
    })),
    {
        selector: 'edge[kind = "involved"]',
        style: {width: 2, 'line-color': '#A0AEC0'},
    },
    {
        selector: 'edge[kind = "owns"], edge[kind = "created"]',
        style: {width: 1.5, 'line-color': '#B7A3D6', 'line-style': 'dotted'},
    },

    // Used when a node is selected, to dim everything outside its immediate
    // neighbourhood.
    {selector: '.faded', style: {opacity: 0.15}},

    // Label thinning on a crowded graph. The company keeps its name so the
    // account is still identifiable, and anything pointed at or selected shows
    // its own name regardless.
    {selector: 'node.labels-hidden', style: {'text-opacity': 0}},
    {selector: 'node.labels-hidden[kind = "company"]', style: {'text-opacity': 1}},
    {selector: 'node.label-shown', style: {'text-opacity': 1}},
]

// Built-in cose layout: no extension package, so the bundle carries one new
// dependency rather than two. Animation is off so the graph settles at once
// and honours a reduced-motion preference by default.
export const GRAPH_LAYOUT = {
    name: 'cose',
    animate: false,
    randomize: false,
    nodeRepulsion: 9000,
    idealEdgeLength: 95,
    nodeDimensionsIncludeLabels: true,
    padding: 28,
    fit: true,
}
