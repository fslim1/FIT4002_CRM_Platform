import {useCallback, useEffect, useRef, useState} from 'react'
import {FiMaximize2, FiZoomIn, FiZoomOut} from 'react-icons/fi'
import {
    graphStylesheet,
    GRAPH_LAYOUT,
    DENSE_NODE_COUNT,
    LABEL_ZOOM,
} from '@/lib/relationshipGraphStyle'

const formatDate = (iso) => {
    if (!iso) return 'No interaction recorded'
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return 'Unknown'
    return date.toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'})
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

// Reads the hover text off whichever element the pointer is over. A
// company-to-contact edge and the contact itself carry the same two numbers, so
// both are worth hovering.
const describe = (target) => {
    const data = target.data()
    if (data.interactionCount === undefined) return null

    const name = target.isEdge() ? target.target().data('label') : data.label
    return {name, count: data.interactionCount, lastInteractionAt: data.lastInteractionAt}
}

const ZOOM_STEP = 1.3

// Fitting a one- or two-node account would otherwise zoom to the maximum and
// blow a single contact up to fill the canvas. Framing it at a normal size
// reads as "this is all there is" rather than as something gone wrong.
const MAX_FIT_ZOOM = 1.5

const fitWithinReason = (cy, padding) => {
    cy.fit(undefined, padding)
    if (cy.zoom() > MAX_FIT_ZOOM) {
        cy.zoom(MAX_FIT_ZOOM)
        cy.center()
    }
}

function RelationshipGraphCanvas({elements, onOpenContact, onOpenDeal, onSelectionChange}) {
    const containerRef = useRef(null)
    const cyRef = useRef(null)
    const [tooltip, setTooltip] = useState(null)
    const [renderError, setRenderError] = useState(null)
    const [namesHidden, setNamesHidden] = useState(false)

    // Cytoscape handlers are registered once per element set. Reading the
    // callbacks through a ref keeps the graph from being torn down and rebuilt
    // every time the parent re-renders with new function identities.
    const handlers = useRef({onOpenContact, onOpenDeal, onSelectionChange})
    useEffect(() => {
        handlers.current = {onOpenContact, onOpenDeal, onSelectionChange}
    }, [onOpenContact, onOpenDeal, onSelectionChange])

    useEffect(() => {
        let cancelled = false
        let cy = null
        let observer = null

        const mount = async () => {
            try {
                // Bundled by Vite as a local chunk, served from the NexGen
                // origin, never fetched from a CDN at runtime. Splitting
                // it out also keeps it off the initial page load for everyone
                // who never opens the panel.
                const cytoscape = (await import('cytoscape')).default
                if (cancelled || !containerRef.current) return

                cy = cytoscape({
                    container: containerRef.current,
                    elements,
                    style: graphStylesheet,
                    layout: GRAPH_LAYOUT,
                    minZoom: 0.2,
                    maxZoom: 3,
                })
                cyRef.current = cy
                fitWithinReason(cy, GRAPH_LAYOUT.padding)

                // Zoom fires continuously while the viewer scrolls or pinches,
                // so the class is rewritten only when the answer changes rather
                // than on every frame.
                const crowded = cy.nodes().length > DENSE_NODE_COUNT
                let hidden = null
                const applyLabelVisibility = () => {
                    const hide = crowded && cy.zoom() < LABEL_ZOOM
                    if (hide === hidden) return
                    hidden = hide
                    cy.batch(() => cy.nodes().toggleClass('labels-hidden', hide))
                    setNamesHidden(hide)
                }
                applyLabelVisibility()
                cy.on('zoom', applyLabelVisibility)

                const show = (event) => {
                    const described = describe(event.target)
                    if (!described) return
                    setTooltip({
                        ...described,
                        x: event.renderedPosition?.x ?? 0,
                        y: event.renderedPosition?.y ?? 0,
                    })
                }
                const hide = () => setTooltip(null)

                cy.on('mouseover', 'edge[kind = "employs"]', show)
                cy.on('mouseover', 'node[kind = "contact"]', show)
                cy.on('mouseout', 'edge, node', hide)

                cy.on('mouseover', 'node', (event) => event.target.addClass('label-shown'))
                cy.on('mouseout', 'node', (event) => {
                    if (!event.target.selected()) event.target.removeClass('label-shown')
                })
                // Panning or dragging should not drag a stale tooltip along.
                cy.on('tapstart', hide)

                // Selecting a node keeps it and its immediate connections lit
                // and dims the rest, so what a record touches is readable at a
                // glance.
                cy.on('select', 'node', (event) => {
                    const node = event.target
                    const neighbourhood = node.closedNeighborhood()
                    cy.elements().difference(neighbourhood).addClass('faded')
                    neighbourhood.removeClass('faded')
                    neighbourhood.nodes().addClass('label-shown')
                    handlers.current.onSelectionChange?.(node.data())
                })

                cy.on('unselect', 'node', () => {
                    cy.elements().removeClass('faded')
                    cy.nodes().removeClass('label-shown')
                    handlers.current.onSelectionChange?.(null)
                })

                // Deliberately NO double-click-to-open. Cytoscape raises
                // dbltap whenever two taps land on the same node inside its
                // threshold, which two ordinary exploratory clicks do easily,
                // and navigating away mid-exploration loses the viewer's place.
                // Opening a record is the selection card's labelled button
                // instead: one obvious affordance, impossible to hit by
                // accident.

                // Without this the graph renders against stale dimensions after
                // the window or the panel changes size.
                if (typeof ResizeObserver !== 'undefined') {
                    observer = new ResizeObserver(() => {
                        if (cyRef.current) cyRef.current.resize()
                    })
                    observer.observe(containerRef.current)
                }
            } catch (error) {
                if (!cancelled) setRenderError(error)
            }
        }

        setTooltip(null)
        setRenderError(null)
        setNamesHidden(false)
        mount()

        return () => {
            cancelled = true
            if (observer) observer.disconnect()
            if (cy) cy.destroy()
            cyRef.current = null
        }
    }, [elements])

    const zoomBy = useCallback((factor) => {
        const cy = cyRef.current
        if (!cy) return
        cy.zoom({level: cy.zoom() * factor, renderedPosition: {x: cy.width() / 2, y: cy.height() / 2}})
        setTooltip(null)
    }, [])

    const resetView = useCallback(() => {
        const cy = cyRef.current
        if (!cy) return
        // Back to the framing the graph opened with, and nothing selected.
        cy.elements().unselect()
        cy.elements().removeClass('faded')
        cy.nodes().removeClass('label-shown')
        fitWithinReason(cy, GRAPH_LAYOUT.padding)
        setTooltip(null)
    }, [])

    if (renderError) {
        return (
            <div className="rg-canvas-wrap">
                <p className="rg-inline-error" role="alert">
                    The graph could not be drawn. Everything else on this page still works.
                </p>
            </div>
        )
    }

    return (
        <div className="rg-canvas-wrap">
            <div className="rg-canvas" ref={containerRef}/>

            <div className="rg-canvas-controls">
                <button
                    type="button"
                    className="rg-icon-btn"
                    onClick={() => zoomBy(ZOOM_STEP)}
                    aria-label="Zoom in"
                    title="Zoom in"
                >
                    <FiZoomIn/>
                </button>
                <button
                    type="button"
                    className="rg-icon-btn"
                    onClick={() => zoomBy(1 / ZOOM_STEP)}
                    aria-label="Zoom out"
                    title="Zoom out"
                >
                    <FiZoomOut/>
                </button>
                <button type="button" className="rg-btn rg-btn--ghost" onClick={resetView}>
                    <FiMaximize2 aria-hidden="true"/>
                    Reset view
                </button>

                {namesHidden && (
                    <span className="rg-canvas-hint">Zoom in or hover to see names</span>
                )}
            </div>

            {tooltip && (
                <div className="rg-tooltip" style={{left: tooltip.x, top: tooltip.y}} role="status">
                    <strong className="rg-tooltip-name">{tooltip.name}</strong>
                    <span>{plural(tooltip.count, 'interaction')} in the last 90 days</span>
                    <span className="rg-tooltip-muted">
                        Last contact: {formatDate(tooltip.lastInteractionAt)}
                    </span>
                </div>
            )}
        </div>
    )
}

export default RelationshipGraphCanvas
