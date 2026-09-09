import {Navigate} from 'react-router-dom'
import {hasPortalSession} from '@/api/portal'

// Guard for customer portal pages, separate from staff ProtectedRoute.
export default function PortalProtectedRoute({children}) {
    if (!hasPortalSession()) {
        return <Navigate to="/portal" replace/>
    }
    return children
}
