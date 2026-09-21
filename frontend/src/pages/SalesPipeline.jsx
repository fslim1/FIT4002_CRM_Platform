import { useState, useEffect } from "react";
import "../styles/SalesPipeline.css";
import DealCard from "../components/DealCard";
import DealDetailModal from "../components/DealDetailModal";
import { getDeals, createDeal, updateDealStage, markDealOutcome, getDealLogs, deleteDeal } from "../api/deals";
import {useAuth} from "@/context/auth";
import {can} from "@/lib/permissions";
import {fetchMyTeam, fetchTeams} from "../api/teams";
import {fetchUsers} from "../api/users";

const STAGES = [
    {name: "Qualified", dot: "#A4A4A4"},
    {name: "Contact Made", dot: "#F5C518"},
    {name: "Demo Scheduled", dot: "#4DC9C9"},
    {name: "Proposal Made", dot: "#F5A623"},
    {name: "Negotiation", dot: "#C0392B"},
];

const INITIAL_FORM = {
    name: "", company: "", price: "",
    priority: "Medium", probability: 20,
    assignee: "", customer: ""
};

function SalesPipeline() {
    const {user} = useAuth();
    // The delete option shows for Admins or people granted Delete Records
    const canDeleteRecords = can(user, 'deleteRecords');
    const [deals, setDeals] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(INITIAL_FORM);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [deleteMode, setDeleteMode] = useState(false);
    const [confirmDeal, setConfirmDeal] = useState(null);
    const [priorityFilter, setPriorityFilter] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedDeal, setSelectedDeal] = useState(null);
    const canViewAllData = can(user, 'viewAllData');
    const isAdmin = user?.role === 'Admin';
    const isSupervisor = user?.role === 'Supervisor';

    const [teamMembers, setTeamMembers] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [allTeams, setAllTeams] = useState([]);
    const [userFilter, setUserFilter] = useState('');
    const [teamFilter, setTeamFilter] = useState('');

    // Load filter options
    useEffect(() => {
        if (isAdmin) {
            // Admin needs all users and all teams in their company
            Promise.all([fetchUsers(), fetchTeams()])
                .then(([usersData, teamsData]) => {
                    setAllUsers(usersData.users || []);
                    setAllTeams(teamsData.teams || []);
                })
                .catch(console.error);
        } else if (isSupervisor) {
            // Supervisor needs their own team members
            fetchMyTeam()
                .then(data => setTeamMembers(data.members || []))
                .catch(console.error);
            // If supervisor has viewAllData, also load all teams
            if (canViewAllData) {
                fetchTeams()
                    .then(data => setAllTeams(data.teams || []))
                    .catch(console.error);
            }
        }
    }, [isAdmin, isSupervisor, canViewAllData]);

// Load deals whenever filters change
    useEffect(() => {
        setLoading(true);
        const params = {};
        if (userFilter) params.userId = userFilter;
        else if (teamFilter) params.teamId = teamFilter;

        getDeals(params)
            .then(data => {
                setDeals(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError('Failed to load deals');
                setLoading(false);
            });
    }, [userFilter, teamFilter]);

    const handleAddLead = () => setShowModal(true);
    const handleCloseModal = () => {
        setShowModal(false);
        setForm(INITIAL_FORM);
    };
    const handleFormChange = (e) => setForm({...form, [e.target.name]: e.target.value});

    const handleSubmit = async () => {
        if (!form.name || !form.company || !form.price) return;
        try {
            const newDeal = await createDeal({
                name: form.name, company: form.company, price: form.price,
                priority: form.priority, probability: Number(form.probability),
                assignee: form.assignee, customer: form.customer,
            });
            setDeals([...deals, newDeal]);
            handleCloseModal();
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.message || 'Failed to add lead');
        }
    };

    const getDealsForStage = (stageName) => deals.filter(d => {
        const matchesStage = d.stage === stageName;
        const matchesPriority = priorityFilter === 'All' || d.priority === priorityFilter;
        const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStage && matchesPriority && matchesSearch;
    });

    const handleDragStart = (e, deal) => {
        e.dataTransfer.setData('dealId', deal._id);
        e.dataTransfer.setData('currentStage', deal.stage);
    };

    const handleDrop = async (e, targetStage) => {
        e.preventDefault();
        const dealId = e.dataTransfer.getData('dealId');
        const currentStage = e.dataTransfer.getData('currentStage');
        if (currentStage === targetStage) return;
        try {
            const updatedDeal = await updateDealStage(dealId, targetStage);
            setDeals(prev => prev.map(d => d._id === updatedDeal._id ? updatedDeal : d));
        } catch (err) {
            alert(err.response?.data?.message || 'Stage change not allowed');
        }
    };

    const handleOutcomeDrop = async (e, outcome) => {
        e.preventDefault();
        const dealId = e.dataTransfer.getData('dealId');
        const currentStage = e.dataTransfer.getData('currentStage');
        if (['Won', 'Lost'].includes(currentStage)) return;
        try {
            const updatedDeal = await markDealOutcome(dealId, outcome);
            setDeals(prev => prev.map(d => d._id === updatedDeal._id ? updatedDeal : d));
        } catch (err) {
            alert(err.response?.data?.message || 'Could not mark outcome');
        }
    };

    const allowDrop = (e) => e.preventDefault();

    const handleOpenHistory = async () => {
        setShowHistory(true);
        setLogsLoading(true);
        try {
            const data = await getDealLogs();
            setLogs(data);
        } catch {
            setLogs([]);
        } finally {
            setLogsLoading(false);
        }
    };

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
    };


    const handleDeleteClick = (deal) => {
        setConfirmDeal(deal);
    };

    const handleConfirmDelete = async () => {
        try {
            await deleteDeal(confirmDeal._id);
            setDeals(prev => prev.filter(d => d._id !== confirmDeal._id));
            setConfirmDeal(null);
            setDeleteMode(false);
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to delete deal');
        }
    };

    const openStages = ['Qualified', 'Contact Made', 'Demo Scheduled', 'Proposal Made', 'Negotiation'];
    const openDeals = deals.filter(d => openStages.includes(d.stage));
    const totalValue = deals
        .reduce((sum, d) => sum + (parseFloat(String(d.price).replace(/[^0-9.]/g, '')) || 0), 0);
    const closedWon = deals.filter(d => d.stage === 'Won')
        .reduce((sum, d) => sum + (parseFloat(String(d.price).replace(/[^0-9.]/g, '')) || 0), 0);
    const avgProbability = deals.length > 0
        ? Math.round(deals.reduce((sum, d) => sum + (d.probability || 0), 0) / deals.length)
        : 0;


    return (
        <div className="pipeline-page">

            {/* Won / Lost drop zones */}
            <div className="wonlost-panel">
                <div
                    className="wonlost-section"
                    onDragOver={allowDrop}
                    onDrop={(e) => handleOutcomeDrop(e, 'Won')}
                >
                    <div className="wonlost-label-row">
                        <span className="wonlost-text">Won</span>
                    </div>
                    <div className="wonlost-box">
                        {getDealsForStage('Won').map(deal => (
                            <DealCard key={deal._id} deal={deal} onDragStart={(e) => handleDragStart(e, deal)}
                                      onClick={() => setSelectedDeal(deal)}/>
                        ))}
                    </div>
                    <div className="wonlost-arrow">&#8964;</div>
                </div>

                <div
                    className="wonlost-section"
                    onDragOver={allowDrop}
                    onDrop={(e) => handleOutcomeDrop(e, 'Lost')}
                >
                    <div className="wonlost-label-row">
                        <span className="wonlost-text">Lost</span>
                    </div>
                    <div className="wonlost-box">
                        {getDealsForStage('Lost').map(deal => (
                            <DealCard key={deal._id} deal={deal} onDragStart={(e) => handleDragStart(e, deal)}
                                      onClick={() => setSelectedDeal(deal)}/>
                        ))}
                    </div>
                    <div className="wonlost-arrow">&#8964;</div>
                </div>
            </div>

            <div className="pipeline-gradient-box">
                <div className="pipeline-title-row">
                    <h1 className="pipeline-title">Sales Pipeline</h1>
                    <button className="btn-deal-history" onClick={handleOpenHistory}>Deal History</button>
                </div>

                <div className="pipeline-stats-row">
                    <div className="pipeline-stat-box">
                        <span className="pipeline-stat-label">Open Deals</span>
                        <span className="pipeline-stat-value">{openDeals.length}</span>
                    </div>
                    <div className="pipeline-stat-box">
                        <span className="pipeline-stat-label">Total Value</span>
                        <span
                            className="pipeline-stat-value">${totalValue >= 1000 ? (totalValue / 1000).toFixed(0) + 'k' : totalValue}</span>
                    </div>
                    <div className="pipeline-stat-box">
                        <span className="pipeline-stat-label">Closed Won</span>
                        <span
                            className="pipeline-stat-value">${closedWon >= 1000 ? (closedWon / 1000).toFixed(0) + 'k' : closedWon}</span>
                    </div>
                    <div className="pipeline-stat-box">
                        <span className="pipeline-stat-label">Avg Probability</span>
                        <span className="pipeline-stat-value">{avgProbability}%</span>
                    </div>
                </div>

                <div className="pipeline-action-bar">
                    <button className="btn-add-lead" onClick={handleAddLead}>+ Add Lead</button>
                    {canDeleteRecords && (
                        <button
                            className="btn-add-lead"
                            onClick={() => setDeleteMode(prev => !prev)}
                            style={{background: deleteMode ? 'linear-gradient(135deg, #7b1a1a 0%, #a02020 100%)' : 'linear-gradient(135deg, #253984 0%, #2A2A72 100%)'}}
                        >
                            {deleteMode ? 'Cancel' : 'Delete'}
                        </button>
                    )}

                    <select
                        className="btn-filter"
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value)}
                    >
                        <option value="All">Priority</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                    </select>

                    <div className="search-wrapper">
                        <input
                            className="btn-search"
                            type="text"
                            placeholder="Search deals..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {/* Supervisor: filter by salesperson in their team */}
                    {isSupervisor && !canViewAllData && teamMembers.length > 0 && (
                        <select
                            className="btn-filter"
                            value={userFilter}
                            onChange={e => {
                                setUserFilter(e.target.value);
                                setTeamFilter('');
                            }}
                        >
                            <option value="">All Salespersons</option>
                            {teamMembers.map(m => (
                                <option key={m.id} value={m.id}>{m.fullName}</option>
                            ))}
                        </select>
                    )}

                    {/* Supervisor with viewAllData: salesperson filter (team only) + team filter */}
                    {isSupervisor && canViewAllData && (
                        <>
                            <select
                                className="btn-filter"
                                value={userFilter}
                                onChange={e => {
                                    setUserFilter(e.target.value);
                                    setTeamFilter('');
                                }}
                            >
                                <option value="">All Salespersons</option>
                                {teamMembers.map(m => (
                                    <option key={m.id} value={m.id}>{m.fullName}</option>
                                ))}
                            </select>
                            <select
                                className="btn-filter"
                                value={teamFilter}
                                onChange={e => {
                                    setTeamFilter(e.target.value);
                                    setUserFilter('');
                                }}
                            >
                                <option value="">All Teams</option>
                                {allTeams.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </>
                    )}

                    {/* Admin: salesperson filter (all company users) + team filter */}
                    {isAdmin && (
                        <>
                            <select
                                className="btn-filter"
                                value={userFilter}
                                onChange={e => {
                                    setUserFilter(e.target.value);
                                    setTeamFilter('');
                                }}
                            >
                                <option value="">All Salespersons</option>
                                {allUsers.map(u => (
                                    <option key={u.id} value={u.id}>{u.fullName} ({u.role})</option>
                                ))}
                            </select>
                            <select
                                className="btn-filter"
                                value={teamFilter}
                                onChange={e => {
                                    setTeamFilter(e.target.value);
                                    setUserFilter('');
                                }}
                            >
                                <option value="">All Teams</option>
                                {allTeams.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        </>
                    )}
                </div>

                {loading && <p style={{color: '#555', fontSize: '14px'}}>Loading deals...</p>}
                {error && <p style={{color: 'red', fontSize: '14px'}}>{error}</p>}

                <div className="pipeline-stages">
                    {STAGES.map(stage => (
                        <div
                            className="stage-column"
                            key={stage.name}
                            onDragOver={allowDrop}
                            onDrop={(e) => handleDrop(e, stage.name)}
                        >
                            <div className="stage-header">
                                <span className="stage-dot" style={{backgroundColor: stage.dot}}/>
                                <span className="stage-name">{stage.name}</span>
                            </div>
                            <div className="stage-cards-area">
                                {getDealsForStage(stage.name).map(deal => (
                                    <DealCard
                                        key={deal._id}
                                        deal={deal}
                                        onDragStart={(e) => handleDragStart(e, deal)}
                                        onClick={deleteMode ? () => handleDeleteClick(deal) : () => setSelectedDeal(deal)}
                                        style={deleteMode
                                            ? {cursor: 'pointer'}
                                            : searchQuery && deal.name.toLowerCase().includes(searchQuery.toLowerCase())
                                                ? {boxShadow: '0 0 0 2px #253984', background: 'rgba(37,57,132,0.07)'}
                                                : {}
                                        }
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Add Lead Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <h2 className="modal-title">Add New Lead</h2>
                        <div className="modal-field">
                            <label className="modal-label">Deal Name *</label>
                            <input className="modal-input" type="text" name="name" value={form.name}
                                   onChange={handleFormChange}/>
                        </div>
                        <div className="modal-field">
                            <label className="modal-label">Company Name *</label>
                            <input className="modal-input" type="text" name="company" value={form.company}
                                   onChange={handleFormChange}/>
                        </div>
                        <div className="modal-field">
                            <label className="modal-label">Deal Price *</label>
                            <input className="modal-input" type="text" name="price" value={form.price}
                                   onChange={handleFormChange}/>
                        </div>
                        <div className="modal-field">
                            <label className="modal-label">Priority</label>
                            <select className="modal-input" name="priority" value={form.priority}
                                    onChange={handleFormChange}>
                                <option value="High">High</option>
                                <option value="Medium">Medium</option>
                                <option value="Low">Low</option>
                            </select>
                        </div>
                        <div className="modal-field">
                            <label className="modal-label">Deal Probability (%)</label>
                            <input className="modal-input" type="number" name="probability" min="0" max="100"
                                   value={form.probability} onChange={handleFormChange}/>
                        </div>
                        <div className="modal-field">
                            <label className="modal-label">Assignee</label>
                            <input className="modal-input" type="text" name="assignee" value={form.assignee}
                                   onChange={handleFormChange}/>
                        </div>
                        <div className="modal-field">
                            <label className="modal-label">Customer</label>
                            <input className="modal-input" type="text" name="customer" value={form.customer}
                                   onChange={handleFormChange}/>
                        </div>
                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={handleCloseModal}>Cancel</button>
                            <button className="btn-submit" onClick={handleSubmit}>Add Lead</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Deal History Modal */}
            {showHistory && (
                <div className="modal-overlay" onClick={() => setShowHistory(false)}>
                    <div className="modal-box history-modal" onClick={e => e.stopPropagation()}>
                        <h2 className="modal-title">Deal History</h2>
                        {logsLoading && <p style={{fontSize: '14px', color: '#555'}}>Loading...</p>}
                        {!logsLoading && logs.length === 0 && (
                            <p style={{fontSize: '14px', color: '#888'}}>No stage changes recorded yet.</p>
                        )}
                        {!logsLoading && logs.length > 0 && (
                            <div className="history-log-list">
                                {logs.map((log, i) => (
                                    <div className="history-log-item" key={i}>
                                        <span className="history-log-date">{formatDate(log.changedAt)}</span>
                                        <span className="history-log-deal">{log.dealName}</span>
                                        <span className="history-log-change">
                      {log.fromStage ? `${log.fromStage} → ${log.toStage}` : `Created as ${log.toStage}`}
                    </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => setShowHistory(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDeal && (
                <div className="modal-overlay" onClick={() => setConfirmDeal(null)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <h2 className="modal-title">Delete Deal</h2>
                        <p style={{fontSize: '14px', color: '#555'}}>
                            Are you sure you want to permanently delete <strong>{confirmDeal.name}</strong>? This cannot
                            be undone.
                        </p>
                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => setConfirmDeal(null)}>Cancel</button>
                            <button
                                className="btn-submit"
                                style={{background: 'linear-gradient(135deg, #7b1a1a 0%, #a02020 100%)'}}
                                onClick={handleConfirmDelete}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedDeal && (
                <DealDetailModal
                    deal={selectedDeal}
                    onClose={() => setSelectedDeal(null)}
                    onDealUpdate={(updatedDeal) => {
                        setDeals(prev => prev.map(d => d._id === updatedDeal._id ? updatedDeal : d));
                        setSelectedDeal(updatedDeal);
                    }}
                />
            )}

        </div>
    );
}

export default SalesPipeline;