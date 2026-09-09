import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/auth'

function Menu({ currentPage, setCurrentPage }) {
    const navigate = useNavigate()
    const location = useLocation()
    const {user} = useAuth()

    return (
        <nav className="menu">
            <button
                className={`menu-item ${location.pathname === '/' ? 'active' : ''}`}
                onClick={() => navigate('/')}
            >
                Dashboard ⌂
            </button>
            <button
                className={`menu-item ${location.pathname === '/pipeline' ? 'active' : ''}`}
                onClick={() => navigate('/pipeline')}
            >
                Sales Pipeline ⊷
            </button>
            <button
                className={`menu-item ${location.pathname === '/task-kanban' ? 'active' : ''}`}
                onClick={() => navigate('/task-kanban')}
            >
                Tasks ☰
            </button>
            <button
                className={`menu-item ${location.pathname === '/customers' ? 'active' : ''}`}
                onClick={() => navigate('/customers')}
            >
                Customers ⌘
            </button>
            <button className="menu-item">
                Calendar ◫
            </button>
            {/* Supervisors get a view of their team and its sharing status */}
            {user?.role === 'Supervisor' && (
                <button
                    className={`menu-item ${location.pathname === '/team' ? 'active' : ''}`}
                    onClick={() => navigate('/team')}
                >
                    My Team ⚑
                </button>
            )}
            {/* The system settings menu is visible only to Admin */}
            {user?.role === 'Admin' && (
                <button
                    className={`menu-item ${location.pathname === '/settings' ? 'active' : ''}`}
                    onClick={() => navigate('/settings')}
                >
                    Settings ⚙
                </button>
            )}
        </nav>
    );
}

export default Menu;