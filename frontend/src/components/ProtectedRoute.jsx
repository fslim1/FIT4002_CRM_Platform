import {Navigate, useLocation} from 'react-router-dom'
import {useAuth} from '@/context/auth'

export default function ProtectedRoute({children, roles}) {
    const {user, initializing} = useAuth()
    const location = useLocation()

    if (initializing) {
        return (
            <div className="flex h-screen items-center justify-center text-stone-600">
                Loading...
            </div>
        )
    }

    if (!user) {
        return <Navigate to="/login" replace state={{from: location}}/>
    }

    if (roles && !roles.includes(user.role)) {
        return <Navigate to="/" replace/>
    }

    return children
}
