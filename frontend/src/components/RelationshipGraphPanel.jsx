import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {FiArrowRight, FiX} from 'react-icons/fi'
import {getAccountGraph} from '@/api/relationshipGraph'
import {toElements} from '@/lib/relationshipGraphStyle'
import RelationshipGraphCanvas from '@/components/RelationshipGraphCanvas'
import RelationshipGraphLegend from '@/components/RelationshipGraphLegend'
import '@/styles/RelationshipGraph.css'

// The backend decides WHEN a notice applies; the wording lives here, so copy
// changes never need a server deploy.
const noticeText = (code, meta) => {
    switch (code) {
        case 'no-company':
            return 'No company is recorded on this profile, so there is no account to draw around it. Add a company to the profile and the rest of the account will appear.'
        case 'sparse-account':
            return 'Nothing else is recorded for this account yet. New contacts and deals appear here the next time you open the graph.'
        case 'no-recent-interactions':
            return 'Nothing has been logged with anyone at this account in the last 90 days, so every connection is drawn in the lowest band.'
        case 'capped': {
            const {contacts = 0, deals = 0} = meta?.omitted || {}
            const dropped = [
                contacts > 0 ? `${contacts} contact${contacts === 1 ? '' : 's'}` : null,
                deals > 0 ? `${deals} deal${deals === 1 ? '' : 's'}` : null,
            ].filter(Boolean)
            const max = meta?.limits?.maxNodes
            const tail = dropped.length > 0 ? ` ${dropped.join(' and ')} not drawn.` : ''
            return `Showing the ${max} most active records in this account.${tail}`
        }
        default:
            return null
    }
}

const errorText = (error) => {
    const status = error?.response?.status
    if (status === 403) return 'You do not have access to this account.'
    if (status === 404) return 'This customer could not be found.'
    return error?.response?.data?.message || 'The relationship graph could not be loaded.'
}

function RelationshipGraphPanel({customerId, customerName, onClose}) {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [attempt, setAttempt] = useState(0)
    const [selected, setSelected] = useState(null)

    const navigate = useNavigate()
    const headingRef = useRef(null)
    // Held in a ref so the focus and key handling below runs once, whatever the
    // parent does with the callback's identity between renders. Synced in an
    // effect rather than during render, which would be a write to a ref while
    // React is rendering.
    const onCloseRef = useRef(onClose)
    useEffect(() => {
        onCloseRef.current = onClose
    }, [onClose])

    useEffect(() => {
        const previouslyFocused = document.activeElement
        headingRef.current?.focus()

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onCloseRef.current?.()
        }
        document.addEventListener('keydown', handleKeyDown)

        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            // Send focus back where it came from, so closing does not strand a
            // keyboard user at the top of the document.
            if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)

        getAccountGraph(customerId)
            .then((graph) => {
                if (cancelled) return
                setData(graph)
                setLoading(false)
            })
            .catch((err) => {
                if (cancelled) return
                setError(err)
                setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [customerId, attempt])

    const elements = useMemo(() => toElements(data), [data])

    // Leaving for a record closes the panel first, so the destination is not
    // hidden behind an overlay the viewer then has to dismiss.
    const openContact = useCallback(
        (recordId) => {
            if (!recordId || recordId === customerId) return
            onCloseRef.current?.()
            navigate(`/customers/${recordId}`)
        },
        [customerId, navigate]
    )

    const openDeal = useCallback(
        (recordId) => {
            if (!recordId) return
            onCloseRef.current?.()
            navigate(`/pipeline?deal=${recordId}`)
        },
        [navigate]
    )

    const handleSelectionChange = useCallback((nodeData) => setSelected(nodeData), [])

    const company = data?.account?.company || ''
    const unmatched = data?.unmatchedDeals || []
    const notices = (data?.notices || [])
        .map((notice) => ({code: notice.code, text: noticeText(notice.code, data?.meta)}))
        .filter((notice) => notice.text)

    const contactNodes = (data?.nodes || []).filter((node) => node.data.kind === 'contact')
    const dealNodes = (data?.nodes || []).filter((node) => node.data.kind === 'deal')

    return (
        <div
            className="rg-overlay"
            role="presentation"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <div className="rg-panel" role="dialog" aria-modal="true" aria-labelledby="rg-title">
                {/* Rendered before the canvas mounts, so the panel is readable
                    and closable while the layout is still settling. */}
                <header className="rg-header">
                    <div className="rg-header-text">
                        <h2 className="rg-title" id="rg-title" ref={headingRef} tabIndex={-1}>
                            Relationship Graph{company ? ` · ${company}` : ''}
                        </h2>
                        <p className="rg-scope">
                            {data?.meta?.scope?.label
                                ? `Built from ${data.meta.scope.label}. Someone with wider access may see a different picture of this account.`
                                : `The account around ${customerName || 'this contact'}.`}
                        </p>
                    </div>
                    <button
                        type="button"
                        className="rg-close"
                        onClick={onClose}
                        aria-label="Close relationship graph"
                    >
                        <FiX/>
                    </button>
                </header>

                <div className="rg-body">
                    <div className="rg-main">
                        {loading && (
                            <div className="rg-state" aria-live="polite">
                                <div className="rg-skeleton" aria-hidden="true"/>
                                <p className="rg-state-text">Building the graph…</p>
                            </div>
                        )}

                        {error && (
                            <div className="rg-state" role="alert">
                                <p className="rg-state-text">{errorText(error)}</p>
                                <button
                                    type="button"
                                    className="rg-btn"
                                    onClick={() => setAttempt((n) => n + 1)}
                                >
                                    Try again
                                </button>
                            </div>
                        )}

                        {!loading && !error && data && (
                            <RelationshipGraphCanvas
                                elements={elements}
                                onOpenContact={openContact}
                                onOpenDeal={openDeal}
                                onSelectionChange={handleSelectionChange}
                            />
                        )}
                    </div>

                    <aside className="rg-rail">
                        {selected && (
                            <div className="rg-rail-section rg-selection" aria-live="polite">
                                <h3 className="rg-rail-title">{selected.label}</h3>
                                {selected.subtitle && (
                                    <p className="rg-selection-sub">{selected.subtitle}</p>
                                )}
                                {selected.kind === 'deal' && selected.stage && (
                                    <p className="rg-selection-sub">{selected.stage}</p>
                                )}

                                {selected.kind === 'contact' && (
                                    <p className="rg-selection-stat">
                                        {selected.interactionCount} interaction
                                        {selected.interactionCount === 1 ? '' : 's'} in the last 90 days
                                    </p>
                                )}
                                {selected.kind === 'deal' && (
                                    <p className="rg-selection-stat">
                                        Drawn against {selected.contactCount} contact
                                        {selected.contactCount === 1 ? '' : 's'} you can see
                                    </p>
                                )}

                                {selected.kind === 'contact' && selected.isFocus && (
                                    <p className="rg-selection-note">You are viewing this profile.</p>
                                )}
                                {selected.kind === 'contact' && !selected.isFocus && (
                                    <button
                                        type="button"
                                        className="rg-btn rg-selection-action"
                                        onClick={() => openContact(selected.recordId)}
                                    >
                                        Open profile
                                        <FiArrowRight aria-hidden="true"/>
                                    </button>
                                )}
                                {selected.kind === 'deal' && (
                                    <button
                                        type="button"
                                        className="rg-btn rg-selection-action"
                                        onClick={() => openDeal(selected.recordId)}
                                    >
                                        Open in pipeline
                                        <FiArrowRight aria-hidden="true"/>
                                    </button>
                                )}
                                {(selected.kind === 'company' || selected.kind === 'salesperson') && (
                                    <p className="rg-selection-note">
                                        Its connections are highlighted on the graph.
                                    </p>
                                )}
                            </div>
                        )}

                        {data && <RelationshipGraphLegend bands={data.meta?.bands}/>}

                        {data && (
                            <div className="rg-rail-section">
                                <h3 className="rg-rail-title">Deals not drawn ({unmatched.length})</h3>
                                {unmatched.length === 0 ? (
                                    <p className="rg-rail-empty">
                                        Every deal in this account is drawn against a contact.
                                    </p>
                                ) : (
                                    <ul className="rg-unmatched-list">
                                        {unmatched.map((deal) => (
                                            <li key={deal.id} className="rg-unmatched-item">
                                                <span className="rg-unmatched-name">{deal.name}</span>
                                                {deal.stage && (
                                                    <span className="rg-unmatched-stage">{deal.stage}</span>
                                                )}
                                                <span className="rg-unmatched-reason">
                                                    No contact here matches
                                                    {deal.customerName ? ` “${deal.customerName}”` : ' the name recorded on it'}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        {/* Explains why a differently spelled company name
                            forms a separate account, so that reads as expected
                            behaviour rather than a fault. Kept as a disclosure
                            so it is there when someone wonders, without
                            shouting at everyone else. */}
                        {data && (
                            <details className="rg-rail-section rg-about">
                                <summary className="rg-about-summary">How this account is put together</summary>
                                <p className="rg-about-text">
                                    Contacts are grouped by the company recorded on their profile. Matching
                                    is exact but ignores capitals and surrounding spaces, so “TranXenergy”,
                                    “tranxenergy” and “ TranXenergy ” are one account.
                                </p>
                                <p className="rg-about-text">
                                    A company name typed differently, such as “TranXenergy Pty”
                                    next to “TranXenergy”, forms a separate account. That is
                                    expected rather than an error. Correcting the company on a
                                    profile merges it here.
                                </p>
                                <p className="rg-about-text">
                                    Nothing on this graph is maintained by hand. Every node and connection
                                    comes from profiles, deals and interactions your team already records,
                                    and new ones appear the next time you open it.
                                </p>
                            </details>
                        )}

                        {/* The canvas itself is a bitmap. This gives a screen
                            reader the same content in text. */}
                        {data && (
                            <div className="rg-sr-only">
                                <h3>Graph contents</h3>
                                <p>
                                    {contactNodes.length} contact{contactNodes.length === 1 ? '' : 's'} and{' '}
                                    {dealNodes.length} deal{dealNodes.length === 1 ? '' : 's'} drawn.
                                </p>
                                <ul>
                                    {contactNodes.map((node) => (
                                        <li key={node.data.id}>
                                            {node.data.label}
                                            {node.data.subtitle ? `, ${node.data.subtitle}` : ''}:{' '}
                                            {node.data.interactionCount} interaction
                                            {node.data.interactionCount === 1 ? '' : 's'} in the last 90 days.
                                        </li>
                                    ))}
                                    {dealNodes.map((node) => (
                                        <li key={node.data.id}>
                                            Deal: {node.data.label}, stage {node.data.stage}.
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </aside>
                </div>

                {notices.length > 0 && (
                    <footer className="rg-notices">
                        {notices.map((notice) => (
                            <p key={notice.code} className="rg-notice">
                                {notice.text}
                            </p>
                        ))}
                    </footer>
                )}
            </div>
        </div>
    )
}

export default RelationshipGraphPanel
