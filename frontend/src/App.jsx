import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import PortalProtectedRoute from '@/components/PortalProtectedRoute'
import AppLayout from '@/components/AppLayout'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import Dashboard from '@/pages/Dashboard'
import SalesPipeline from '@/pages/SalesPipeline'
import Customers from "@/pages/Customers";
import CustomerProfile from "@/pages/CustomerProfile";
import TaskKanban from './pages/TaskKanban'
import AdminSettings from '@/pages/AdminSettings'
import MyTeam from '@/pages/MyTeam'
import PortalLogin from '@/pages/PortalLogin'
import PortalDashboard from '@/pages/PortalDashboard'

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login/>}/>
                    <Route path="/signup" element={<Signup/>}/>
                    <Route
                        path="/"
                        element={
                            <ProtectedRoute>
                                <AppLayout>
                                    <Dashboard/>
                                </AppLayout>
                            </ProtectedRoute>
                        }
                    />

                    <Route
                        path="/customers"
                        element={
                            <ProtectedRoute>
                                <AppLayout>
                                    <Customers/>
                                </AppLayout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/customers/:id"
                        element={
                            <ProtectedRoute>
                                <AppLayout>
                                    <CustomerProfile/>
                                </AppLayout>
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/pipeline"
                        element={
                            <ProtectedRoute>
                                <AppLayout>
                                    <SalesPipeline/>
                                </AppLayout>
                            </ProtectedRoute>
                        }
                    />

                    <Route
                        path="/task-kanban"
                        element={
                            <ProtectedRoute>
                                <AppLayout>
                                    <TaskKanban/>
                                </AppLayout>
                            </ProtectedRoute>
                        }
                    />

                    {/* System settings are Admin-only */}
                    <Route
                        path="/settings"
                        element={
                            <ProtectedRoute roles={['Admin']}>
                                <AppLayout>
                                    <AdminSettings/>
                                </AppLayout>
                            </ProtectedRoute>
                        }
                    />

                    {/* Supervisors can review their team and its sharing status */}
                    <Route
                        path="/team"
                        element={
                            <ProtectedRoute roles={['Supervisor', 'Admin']}>
                                <AppLayout>
                                    <MyTeam/>
                                </AppLayout>
                            </ProtectedRoute>
                        }
                    />

                    {/* Customer self-service portal, separate from staff auth */}
                    <Route path="/portal" element={<PortalLogin/>}/>
                    <Route
                        path="/portal/home"
                        element={
                            <PortalProtectedRoute>
                                <PortalDashboard/>
                            </PortalProtectedRoute>
                        }
                    />

                    <Route path="*" element={<Navigate to="/" replace/>}/>
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App