import {NODE_KINDS, BAND_STYLES} from '@/lib/relationshipGraphStyle'

// The band thresholds and their wording come from the API response, so the
// legend can never describe different numbers from the ones the graph was
// drawn with.
function RelationshipGraphLegend({bands = [], activityTypes = []}) {
    return (
        <div className="rg-legend">
            <h3 className="rg-legend-title">Legend</h3>

            <ul className="rg-legend-list">
                {NODE_KINDS.map(({kind, label, color}) => (
                    <li key={kind} className="rg-legend-row">
                        <span
                            className={`rg-swatch rg-swatch--${kind}`}
                            style={kind === 'salesperson' ? {borderBottomColor: color} : {background: color}}
                            aria-hidden="true"
                        />
                        <span className="rg-legend-label">{label}</span>
                    </li>
                ))}
            </ul>

            <p className="rg-legend-note">A deal takes its colour from its pipeline stage.</p>

            <div className="rg-legend-row rg-legend-single">
                <span className="rg-swatch rg-swatch--single-threaded" aria-hidden="true"/>
                <span className="rg-legend-label">Deal linked to exactly one contact</span>
            </div>

            {bands.length > 0 && (
                <>
                    <h4 className="rg-legend-subtitle">Contact in the last 90 days</h4>
                    <ul className="rg-legend-list">
                        {bands.map((band) => {
                            const style = BAND_STYLES[band.key] || BAND_STYLES.none
                            return (
                                <li key={band.key} className="rg-legend-row">
                                    <span
                                        className="rg-swatch rg-swatch--band"
                                        style={{
                                            borderTopWidth: `${style.width}px`,
                                            borderTopStyle: style.lineStyle,
                                            borderTopColor: style.color,
                                        }}
                                        aria-hidden="true"
                                    />
                                    <span className="rg-legend-label">{band.label}</span>
                                </li>
                            )
                        })}
                    </ul>
                    {activityTypes.length > 0 && (
                        <p className="rg-legend-note">
                            Counts {activityTypes.map((type) => type.toLowerCase()).join(', ')} records.
                        </p>
                    )}
                </>
            )}
        </div>
    )
}

export default RelationshipGraphLegend
