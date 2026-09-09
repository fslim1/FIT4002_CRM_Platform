import React, { useState, useEffect, useCallback } from 'react'
import '../styles/Dashboard.css'
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, BarChart, Bar
} from 'recharts'
import {
    FiTrendingUp, FiCheckCircle, FiClock, FiDollarSign,
    FiPhone, FiUsers, FiMail, FiAward,
    FiBarChart2, FiGitMerge, FiActivity,
    FiArrowUp, FiArrowDown, FiUser, FiVideo, FiMove,
    FiFileText, FiPaperclip, FiEdit2, FiList, FiFile, FiEdit3, FiFolder, FiAlertTriangle
} from 'react-icons/fi'
import {useAuth} from '@/context/auth'
import {fetchDashboardData} from '@/api/dashboard'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    arraySwap,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    rectSwappingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';

const POLL_MS     = 30000
const ACCENT = '#253984'
const ACCENT_DIM = '#2A2A72'
const CHART_GREEN = '#4DC9C9'
const CHART_GREY = '#A4A4A4'
const fmtCurrency = (v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
const fmtMoney = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
const fmtTime = (iso) => { const d = new Date(iso); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }

function Skeleton({ w = '100%', h = 20 }) {
    return <div className="skeleton" style={{ width: w, height: h }} />
}

function SortableKpiCard({id, icon, label, value, change, showChange, sub, loading, isEditing}) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id});
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 'auto',
        opacity: isDragging ? 0.8 : 1,
        position: 'relative'
    };

    const positive = change >= 0
    return (
        <div className="kpi-card" ref={setNodeRef} style={style}>
            <div className="kpi-card-top">
                <span className="kpi-icon" {...(isEditing ? attributes : {})} {...(isEditing ? listeners : {})}
                      style={{cursor: isEditing ? 'grab' : 'default', display: 'flex', alignItems: 'center'}}>
                    {isEditing && <FiMove size={14} style={{marginRight: '6px', opacity: 0.4}}/>}
                    {icon}
                </span>
                {showChange !== false && change !== null ? (
                    <span className={`kpi-badge ${positive ? 'badge-up' : 'badge-down'}`}>
                        {positive ? <FiArrowUp size={10}/> : <FiArrowDown size={10}/>} {Math.abs(change)}%
                    </span>
                ) : null}
            </div>
            <div className="kpi-label">{label}</div>
            {loading ? <Skeleton h={36} w="70%" /> : <div className="kpi-value">{value}</div>}
            {loading ? <Skeleton h={14} w="50%"/> : (showChange !== false && sub ?
                <div className="kpi-sub">{sub}</div> : null)}
        </div>
    )
}

const DonutLabel = ({ cx, cy, pct }) => (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="donut-center-text">
        <tspan x={cx} dy="-0.4em" fontSize="22" fontWeight="700" fill="#333">{pct}%</tspan>
        <tspan x={cx} dy="1.4em" fontSize="11" fill="#888">Completed</tspan>
    </text>
)

const ChartTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
        <div className="chart-tooltip">
            <p className="ct-label">{label}</p>
            {payload.map((p) => (
                <p key={p.name} style={{ color: p.color }}>
                    {p.name === 'sales' ? fmtMoney(p.value) : `${p.value} deals`}
                </p>
            ))}
        </div>
    )
}

const DEFAULT_KPI_LAYOUT = ['totalSales', 'dealsCompleted', 'ongoingDeals', 'avgDealValue'];
const DEFAULT_LAYOUT = ['pipeline', 'trends', 'activity', 'team'];

function SortableCard({id, title, subTitle, headerRight, children, isEditing}) {
    const {attributes, listeners, setNodeRef, transform, transition, isDragging} = useSortable({id});
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 'auto',
        opacity: isDragging ? 0.8 : 1,
    };

    return (
        <div className={`chart-card ${id}-card`} ref={setNodeRef} style={style}>
            <div className="card-header">
                <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                    {isEditing && (
                        <div className="drag-handle" {...attributes} {...listeners}>
                            <FiMove size={16}/>
                        </div>
                    )}
                    <div>
                        <h3 className="card-title">{title}</h3>
                        <p className="card-sub">{subTitle}</p>
                    </div>
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                    {headerRight}
                </div>
            </div>
            {children}
        </div>
    );
}


export default function Dashboard() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [clock, setClock] = useState('')
    const [lastUpdated, setLastUpdated] = useState('')
    const [salesChartType, setSalesChartType] = useState('area')
    const [isEditing, setIsEditing] = useState(false)
    const [membersList, setMembersList] = useState([])
    const [selectedMemberId, setSelectedMemberId] = useState('')
    const [timeFilter, setTimeFilter] = useState('thisMonth')
    const [customStartDate, setCustomStartDate] = useState('')
    const [customEndDate, setCustomEndDate] = useState('')
    const {user} = useAuth()

    const [kpiLayoutOrder, setKpiLayoutOrder] = useState(() => {
        const saved = localStorage.getItem(`dashboard-kpi-layout-${user?.id || 'guest'}`);
        return saved ? JSON.parse(saved) : DEFAULT_KPI_LAYOUT;
    });

    const [layoutOrder, setLayoutOrder] = useState(() => {
        const saved = localStorage.getItem(`dashboard-layout-${user?.id || 'guest'}`);
        return saved ? JSON.parse(saved) : DEFAULT_LAYOUT;
    });

    useEffect(() => {
        if (user?.id) {
            const savedKpi = localStorage.getItem(`dashboard-kpi-layout-${user.id}`);
            if (savedKpi) setKpiLayoutOrder(JSON.parse(savedKpi));
            else setKpiLayoutOrder(DEFAULT_KPI_LAYOUT);

            const savedLayout = localStorage.getItem(`dashboard-layout-${user.id}`);
            if (savedLayout) setLayoutOrder(JSON.parse(savedLayout));
            else setLayoutOrder(DEFAULT_LAYOUT);
        }
    }, [user?.id]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates})
    );

    const handleDragEnd = (event) => {
        const {active, over} = event;
        if (over && active.id !== over.id) {
            if (DEFAULT_KPI_LAYOUT.includes(active.id)) {
                setKpiLayoutOrder((items) => {
                    const oldIndex = items.indexOf(active.id);
                    const newIndex = items.indexOf(over.id);
                    const newOrder = arraySwap(items, oldIndex, newIndex);
                    localStorage.setItem(`dashboard-kpi-layout-${user?.id || 'guest'}`, JSON.stringify(newOrder));
                    return newOrder;
                });
            } else {
                setLayoutOrder((items) => {
                    const oldIndex = items.indexOf(active.id);
                    const newIndex = items.indexOf(over.id);
                    const newOrder = arraySwap(items, oldIndex, newIndex);
                    localStorage.setItem(`dashboard-layout-${user?.id || 'guest'}`, JSON.stringify(newOrder));
                    return newOrder;
                });
            }
        }
    };

    const resetLayout = () => {
        setKpiLayoutOrder(DEFAULT_KPI_LAYOUT);
        setLayoutOrder(DEFAULT_LAYOUT);
        localStorage.removeItem(`dashboard-kpi-layout-${user?.id || 'guest'}`);
        localStorage.removeItem(`dashboard-layout-${user?.id || 'guest'}`);
    };

    useEffect(() => {
        const tick = () => setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [])

    useEffect(() => {
        let mounted = true;
        const loadData = async () => {
            try {
                const result = await fetchDashboardData(selectedMemberId, timeFilter, customStartDate, customEndDate);
                if (mounted) {
                    setData(result);
                    setMembersList(prev => prev.length === 0 && result.membersList ? result.membersList : prev);
                    setLoading(false);
                    setLastUpdated(new Date().toLocaleTimeString());
                }
            } catch (err) {
                console.error("Failed to fetch dashboard data:", err);
                if (mounted) setLoading(false);
            }
        };

        setLoading(true);
        loadData();
        const id = setInterval(loadData, 5000); // Poll every 5 seconds

        return () => {
            mounted = false;
            clearInterval(id);
        };
    }, [selectedMemberId, timeFilter, customStartDate, customEndDate]);

    const pipeline = data?.pipeline
    const CHART_WIN = '#4DC9C9'
    const CHART_LOST = '#e74c3c'
    const pieData = pipeline ? [
        {name: 'Won Deals', value: pipeline.completedDeals},
        {name: 'Ongoing Deals', value: pipeline.ongoingDeals},
        {name: 'Lost Deals', value: pipeline.lostDeals}
    ] : []
    const pct = pipeline && pipeline.total > 0 ? Math.round(((pipeline.completedDeals + pipeline.lostDeals) / pipeline.total) * 100) : 0
    const teamMembers = data?.teamPerformance?.members ?? []
    const topMember = data?.teamPerformance?.topMember ?? ''
    const teamTotal = teamMembers.reduce((s, m) => s + m.sales, 0)
    const teamDeals = teamMembers.reduce((s, m) => s + m.deals, 0)
    const teamAvg = teamMembers.length ? Math.round(teamTotal / teamMembers.length) : 0
    const recentActivities = data?.recentActivities?.map(act => ({
        ...act,
        icon: act.iconType === 'phone' ? <FiPhone size={14}/> :
            act.iconType === 'mail' ? <FiMail size={14}/> :
                act.iconType === 'task' ? <FiList size={14}/> :
                    act.iconType === 'note' ? <FiEdit3 size={14}/> :
                        act.iconType === 'file' ? <FiFolder size={14}/> :
                            <FiVideo size={14}/>
    })) ?? []

    const subText = timeFilter === 'today' ? 'vs yesterday'
        : timeFilter === 'thisWeek' ? 'vs last week'
            : timeFilter === 'thisMonth' ? 'vs last month'
                : timeFilter === 'thisYear' ? 'vs last year'
                    : '';

    const renderKpi = (id) => {
        switch (id) {
            case 'totalSales':
                return <SortableKpiCard key="totalSales" id="totalSales" isEditing={isEditing}
                                        icon={<FiTrendingUp size={20}/>} label="TOTAL SALES"
                                        value={data ? fmtMoney(data.totalSales.value) : '—'}
                                        change={data?.totalSales.changePercent ?? 0}
                                        showChange={data?.totalSales.showChange} sub={subText} loading={loading}/>
            case 'dealsCompleted':
                return <SortableKpiCard key="dealsCompleted" id="dealsCompleted" isEditing={isEditing}
                                        icon={<FiCheckCircle size={20}/>} label="DEALS COMPLETED"
                                        value={data?.dealsCompleted.value ?? '—'}
                                        change={data?.dealsCompleted.changePercent ?? 0}
                                        showChange={data?.dealsCompleted.showChange} sub={subText} loading={loading}/>
            case 'ongoingDeals':
                return <SortableKpiCard key="ongoingDeals" id="ongoingDeals" isEditing={isEditing}
                                        icon={<FiClock size={20}/>} label="ONGOING DEALS"
                                        value={data?.ongoingDeals.value ?? '—'}
                                        change={data?.ongoingDeals.changePercent ?? 0}
                                        showChange={data?.ongoingDeals.showChange} sub={subText} loading={loading}/>
            case 'avgDealValue':
                return <SortableKpiCard key="avgDealValue" id="avgDealValue" isEditing={isEditing}
                                        icon={<FiDollarSign size={20}/>} label="AVG DEAL VALUE"
                                        value={data ? fmtMoney(data.avgDealValue.value) : '—'}
                                        change={data?.avgDealValue.changePercent ?? 0}
                                        showChange={data?.avgDealValue.showChange} sub={subText} loading={loading}/>
            default:
                return null;
        }
    }

    const renderChart = (id) => {
        switch (id) {
            case 'pipeline':
                return (
                    <SortableCard
                        key="pipeline"
                        id="pipeline"
                        title="Sales Pipeline"
                        subTitle="Completed vs ongoing deals"
                        isEditing={isEditing}
                        headerRight={pipeline && <span className="total-badge">{pipeline.total} Total</span>}
                    >
                        <div className="pipeline-body" style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'space-evenly',
                            gap: '20px',
                            padding: '10px 0'
                        }}>
                            <div className="donut-wrap">
                                {loading ? <Skeleton w={180} h={180}/> : (
                                    <PieChart width={180} height={180} margin={{top: 0, right: 0, bottom: 0, left: 0}}>
                                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                                             startAngle={90} endAngle={-270} dataKey="value" paddingAngle={3}>
                                            <Cell fill={CHART_WIN} stroke="none"/>
                                            <Cell fill={CHART_GREY} stroke="none"/>
                                            <Cell fill="#e74c3c" stroke="none"/>
                                        </Pie>
                                        <DonutLabel cx={90} cy={90} pct={pct}/>
                                    </PieChart>
                                )}
                                <div className="donut-legend">
                                    <span className="dot"
                                          style={{background: CHART_WIN}}/><span>Won Deals</span><strong>{pipeline?.completedDeals ?? '—'}</strong>
                                    <span className="dot"
                                          style={{background: CHART_GREY}}/><span>Ongoing Deals</span><strong>{pipeline?.ongoingDeals ?? '—'}</strong>
                                    <span className="dot"
                                          style={{background: CHART_LOST}}/><span>Lost Deals</span><strong>{pipeline?.lostDeals ?? '—'}</strong>
                                </div>
                            </div>
                            <div className="stage-breakdown" style={{width: '100%'}}>
                                <p className="stage-title">Pipeline Stages</p>
                                {loading ? [1, 2, 3, 4, 5].map(i => <Skeleton key={i}
                                                                              h={14}/>) : pipeline?.stages.map((s) => (
                                    <div key={s.name} className="stage-row">
                                        <span className="stage-name">{s.name}</span>
                                        <span className="stage-count">{s.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </SortableCard>
                );
            case 'trends':
                return (
                    <SortableCard
                        key="trends"
                        id="trends"
                        title="Sales Trends"
                        subTitle="Revenue and deals performance over time"
                        isEditing={isEditing}
                        headerRight={
                            <div className="chart-toggle">
                                <button className={`toggle-btn ${salesChartType === 'area' ? 'active' : ''}`}
                                        onClick={() => setSalesChartType('area')}><FiTrendingUp size={16}/></button>
                                <button className={`toggle-btn ${salesChartType === 'bar' ? 'active' : ''}`}
                                        onClick={() => setSalesChartType('bar')}><FiBarChart2 size={16}/></button>
                            </div>
                        }
                    >
                        {(() => {
                            let chartData = data?.salesTrends?.length > 0 ? [...data.salesTrends] : [{
                                week: 'No Data',
                                sales: 0
                            }];
                            if (chartData.length === 1 && chartData[0].week !== 'No Data') {
                                chartData = [{week: '', sales: 0}, chartData[0], {week: ' ', sales: 0}];
                            }
                            return loading ? <Skeleton h={160}/> :
                                salesChartType === 'area' ? (
                                    <div style={{flex: 1, minHeight: 160, width: '100%', minWidth: 0}}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={chartData}
                                                       margin={{top: 10, right: 10, left: 0, bottom: 0}}>
                                                <defs>
                                                    <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={ACCENT} stopOpacity={0.6}/>
                                                        <stop offset="95%" stopColor={ACCENT} stopOpacity={0.05}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)"/>
                                                <XAxis dataKey="week" tick={{fontSize: 11, fill: '#777'}}
                                                       axisLine={false} tickLine={false}/>
                                                <YAxis tickFormatter={fmtCurrency} tick={{fontSize: 11, fill: '#777'}}
                                                       axisLine={false} tickLine={false} width={48}/>
                                                <Tooltip content={<ChartTooltip/>}/>
                                                <Area type="monotone" dataKey="sales" name="sales" stroke={ACCENT_DIM}
                                                      strokeWidth={2} fill="url(#gradSales)"
                                                      dot={{r: 3, fill: ACCENT_DIM}} activeDot={{r: 5}}/>
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : (
                                    <div style={{flex: 1, minHeight: 160, width: '100%', minWidth: 0}}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData}
                                                      margin={{top: 10, right: 10, left: 0, bottom: 0}}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)"
                                                               vertical={false}/>
                                                <XAxis dataKey="week" tick={{fontSize: 11, fill: '#777'}}
                                                       axisLine={false} tickLine={false}/>
                                                <YAxis tickFormatter={fmtCurrency} tick={{fontSize: 11, fill: '#777'}}
                                                       axisLine={false} tickLine={false} width={48}/>
                                                <Tooltip content={<ChartTooltip/>}/>
                                                <Bar dataKey="sales" name="sales" fill={ACCENT} radius={[4, 4, 0, 0]}
                                                     maxBarSize={40}/>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                );
                        })()}
                    </SortableCard>
                );
            case 'activity':
                return (
                    <SortableCard
                        key="activity"
                        id="activity"
                        title="Activity Summary"
                        subTitle={user?.role === 'User' ? 'Your activities' : (selectedMemberId ? 'Team member activities' : 'All team activities')}
                        isEditing={isEditing}
                    >
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                        }}>
                            <div className="activity-grid">
                                {[
                                    {
                                        icon: <FiPhone size={20}/>,
                                        label: 'Calls Made',
                                        key: 'callsMade',
                                        changeKey: 'callsChange'
                                    },
                                    {
                                        icon: <FiUsers size={20}/>,
                                        label: 'Meetings Held',
                                        key: 'meetingsHeld',
                                        changeKey: 'meetingsChange'
                                    },
                                    {
                                        icon: <FiMail size={20}/>,
                                        label: 'Emails Sent',
                                        key: 'emailsSent',
                                        changeKey: 'emailsChange'
                                    },
                                    {
                                        icon: <FiAward size={20}/>,
                                        label: 'Deals Closed',
                                        key: 'dealsClosed',
                                        changeKey: 'dealsChange'
                                    },
                                ].map(({icon, label, key, changeKey}) => {
                                    const val = data?.activitySummary?.[key]
                                    const chg = data?.activitySummary?.[changeKey] ?? 0
                                    const pos = chg >= 0
                                    return (
                                        <div key={key} className="activity-tile">
                                            <div className="activity-tile-top">
                                                <span className="activity-icon">{icon}</span>
                                                {data?.totalSales?.showChange !== false && chg !== null && (
                                                    <span className={`kpi-badge ${pos ? 'badge-up' : 'badge-down'}`}
                                                          style={{fontSize: 11}}>{pos ? '+' : ''}{chg}%</span>
                                                )}
                                            </div>
                                            {loading ? <Skeleton h={28} w="50%"/> :
                                                <div className="activity-val">{val ?? '—'}</div>}
                                            <div className="activity-label">{label}</div>
                                        </div>
                                    )
                                })}
                            </div>
                            <div className="recent-activities" style={{marginTop: 'auto'}}>
                                <h4 className="recent-activities-title">{user?.role === 'User' ? 'Your Recent Activities' : 'Recent Activities'}</h4>
                                <div className="recent-activities-list">
                                    {recentActivities.map(act => (
                                        <div key={act.id} className="recent-activity-item"
                                             style={{backgroundColor: act.id === 1 ? '#eaf6ff' : '#fff'}}>
                                            <div className="recent-activity-icon"
                                                 style={{backgroundColor: act.bg, color: act.color}}>{act.icon}</div>
                                            <div className="recent-activity-details">
                                                <span className="recent-activity-company">{act.company}</span>
                                                <span className="recent-activity-desc">{act.desc}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </SortableCard>
                );
            case 'team':
                return (
                    <SortableCard
                        key="team"
                        id="team"
                        title="Team Performance"
                        subTitle="Compare team member metrics"
                        isEditing={isEditing}
                        headerRight={topMember && <span className="top-badge"><FiAward size={13} style={{
                            marginRight: 4,
                            verticalAlign: 'middle'
                        }}/>Top: {topMember}</span>}
                    >
                        {loading ? <Skeleton h={160}/> : (
                            <div style={{flex: 1, minHeight: 185, width: '100%', minWidth: 0}}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={teamMembers} margin={{top: 5, right: 10, left: -15, bottom: 25}}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)"
                                                       vertical={false}/>
                                        <XAxis dataKey="name" interval={0} angle={-25} textAnchor="end"
                                               tick={{fontSize: 10, fill: '#555'}} height={40} axisLine={false}
                                               tickLine={false}/>
                                        <YAxis tickFormatter={fmtCurrency} tick={{fontSize: 10, fill: '#777'}}
                                               axisLine={false} tickLine={false}/>
                                        <Tooltip formatter={(v) => [fmtMoney(v), 'Total Sales']}/>
                                        <Bar dataKey="sales" name="Total Sales" fill={ACCENT} radius={[4, 4, 0, 0]}
                                             maxBarSize={36}/>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                        <div className="team-table-container">
                            <table className="team-table">
                                <thead>
                                <tr>
                                    <th>Team Member</th>
                                    <th>Sales</th>
                                    <th>Deals</th>
                                    <th>Activities</th>
                                </tr>
                                </thead>
                                <tbody>
                                {loading ? [1, 2, 3].map(i => (
                                        <tr key={i}>{[1, 2, 3, 4].map(j => <td key={j}><Skeleton h={12}/></td>)}</tr>))
                                    : teamMembers.map((m) => (
                                        <tr key={m.name} className={m.name === topMember ? 'top-row' : ''}>
                                            <td>{m.name}</td>
                                            <td>{fmtMoney(m.sales)}</td>
                                            <td>{m.deals}</td>
                                            <td>{m.activities}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {!loading && (
                            <div className="team-footer">
                                <div className="team-footer-item"><span className="tf-icon"
                                                                        style={{background: ACCENT}}><FiBarChart2
                                    size={16}/></span><span>Total Sales</span><strong>{fmtMoney(teamTotal)}</strong>
                                </div>
                                <div className="team-footer-item"><span className="tf-icon"
                                                                        style={{background: CHART_GREEN}}><FiGitMerge
                                    size={16}/></span><span>Total Deals</span><strong>{teamDeals}</strong></div>
                                <div className="team-footer-item"><span className="tf-icon"
                                                                        style={{background: '#aaa'}}><FiActivity
                                    size={16}/></span><span>Avg per Member</span><strong>{fmtMoney(teamAvg)}</strong>
                                </div>
                            </div>
                        )}
                    </SortableCard>
                );
            default:
                return null;
        }
    }

    const isCustomDateError = timeFilter === 'custom' && customStartDate && customEndDate && new Date(customEndDate) < new Date(customStartDate);

    return (
        <div className="dashboard" style={{overflowY: isCustomDateError ? 'hidden' : 'auto'}}>

            <div className="dashboard-topbar">
                <div className="dashboard-user">
                    <div className="dashboard-user-avatar"><FiUser size={20}/></div>
                    <div className="dashboard-user-info">
                        <span className="dashboard-user-name">{user?.fullName ? `${user.fullName} (You)` : 'You'}</span>
                        <span
                            className="dashboard-user-role">{user?.role === 'User' ? 'Salesperson' : user?.role}</span>
                    </div>
                </div>
                <div className="dashboard-filters">
                    {timeFilter === 'custom' && (
                        <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                            <input type="date" className="dashboard-select" value={customStartDate}
                                   onChange={e => setCustomStartDate(e.target.value)}/>
                            <span style={{fontSize: '0.85rem', color: '#666', fontWeight: 500}}>to</span>
                            <input type="date" className="dashboard-select" value={customEndDate}
                                   onChange={e => setCustomEndDate(e.target.value)}/>
                        </div>
                    )}
                    <select className="dashboard-select" value={timeFilter}
                            onChange={(e) => setTimeFilter(e.target.value)}>
                        <option value="today">Today</option>
                        <option value="thisWeek">This Week</option>
                        <option value="thisMonth">This Month</option>
                        <option value="thisYear">This Year</option>
                        <option value="all">All Time</option>
                        <option value="custom">Custom Date Range</option>
                    </select>
                    {user?.role === 'Admin' || user?.role === 'Supervisor' ? (
                        <select className="dashboard-select" value={selectedMemberId}
                                onChange={(e) => setSelectedMemberId(e.target.value)}>
                            <option value="">All Team Members</option>
                            {membersList.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    ) : null}
                    <button className="dashboard-reset-btn" onClick={() => setIsEditing(!isEditing)}
                            style={{background: isEditing ? '#253984' : '#fff', color: isEditing ? '#fff' : '#444'}}>
                        {isEditing ? 'Done Editing' : 'Edit Layout'}
                    </button>
                    {isEditing && <button className="dashboard-reset-btn" onClick={resetLayout}>Reset</button>}
                </div>
            </div>

            <div className="live-banner">
                <span className="live-dot"/>
                <span className="live-text">Live · Updated {lastUpdated || clock}</span>
                {error && <span className="live-error"> · {error}</span>}
            </div>

            {isCustomDateError && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 100,
                    background: 'rgba(255,255,255,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(3px)',
                    borderRadius: '12px'
                }}>
                    <div style={{
                        background: '#fef2f2',
                        color: '#991b1b',
                        border: '1px solid #fecaca',
                        padding: '20px 40px',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '25px',
                        fontWeight: 500,
                        fontSize: '1.1rem'
                    }}>
                        <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                            <FiAlertTriangle size={24} color="#dc2626"/>
                            Invalid Date Range: End date cannot be earlier than start date.
                        </div>
                        <button
                            onClick={() => setCustomEndDate('')}
                            style={{
                                background: '#dc2626',
                                color: '#fff',
                                border: 'none',
                                padding: '8px 16px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 600
                            }}
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <div className="kpi-row">
                    <SortableContext
                        items={kpiLayoutOrder}
                        strategy={rectSwappingStrategy}
                    >
                        {kpiLayoutOrder.map(id => renderKpi(id))}
                    </SortableContext>
                </div>

                <div className="chart-grid">
                    <SortableContext
                        items={layoutOrder.filter(id => id !== 'team' || user?.role === 'Admin' || user?.role === 'Supervisor')}
                        strategy={rectSwappingStrategy}
                    >
                        {layoutOrder.filter(id => id !== 'team' || user?.role === 'Admin' || user?.role === 'Supervisor').map(id => renderChart(id))}
                    </SortableContext>
                </div>
            </DndContext>
        </div>
    )
}
