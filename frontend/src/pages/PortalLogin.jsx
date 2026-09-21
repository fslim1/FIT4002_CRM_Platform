import {useEffect, useState} from 'react'
import {Link, useNavigate} from 'react-router-dom'
import {ArrowRight, Lock, Mail, UserPlus} from 'lucide-react'
import AppHeader from '@/components/AppHeader'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Card, CardContent} from '@/components/ui/card'
import {Alert, AlertDescription} from '@/components/ui/alert'
import PasswordChecklist from '@/components/PasswordChecklist'
import {isPasswordValid} from '@/lib/passwordPolicy'
import {
    hasPortalSession,
    portalLogin,
    portalRegister,
    storePortalSession,
} from '@/api/portal'

// Customer self-service portal: register and log in.
export default function PortalLogin() {
    const navigate = useNavigate()
    const [mode, setMode] = useState('login')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (hasPortalSession()) {
            navigate('/portal/home', {replace: true})
        }
    }, [navigate])

    const isRegister = mode === 'register'

    const switchMode = (nextMode) => {
        setMode(nextMode)
        setError('')
        setPassword('')
        setConfirmPassword('')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (!email || !password) {
            setError('Please enter your email and password.')
            return
        }
        if (isRegister && !isPasswordValid(password)) {
            setError('Please meet all of the password requirements.')
            return
        }
        if (isRegister && password !== confirmPassword) {
            setError('Passwords do not match.')
            return
        }

        setSubmitting(true)
        try {
            const action = isRegister ? portalRegister : portalLogin
            const {token, profile} = await action({email: email.trim(), password})
            storePortalSession(token, profile)
            navigate('/portal/home', {replace: true})
        } catch (err) {
            setError(
                err?.response?.data?.message ||
                (isRegister
                    ? 'Unable to create your account. Please try again.'
                    : 'Unable to log in. Please try again.')
            )
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div
            className="min-h-screen"
            style={{
                backgroundImage:
                    'linear-gradient(135deg, #1B1C3A 0%, #253984 55%, #2A2A72 100%)',
            }}
        >
            <AppHeader/>

            <main className="flex min-h-[calc(100vh-92px)] flex-col items-center px-4 py-10">
                <h1 className="mb-1 text-center text-5xl font-extrabold tracking-tight text-white drop-shadow-sm sm:text-6xl">
                    Customer Portal
                </h1>
                <p className="mb-8 text-center text-lg text-sky-100/90">
                    {isRegister
                        ? 'Create your login to track your deals with us'
                        : 'Log in to view your profile and deal progress'}
                </p>

                <Card className="w-full max-w-md rounded-3xl border-white/40 bg-white/95 shadow-2xl">
                    <CardContent className="p-8">
                        <form onSubmit={handleSubmit} noValidate className="space-y-5">
                            <div className="space-y-2">
                                <Label
                                    htmlFor="portal-email"
                                    className="flex items-center gap-2 text-slate-700"
                                >
                                    <Mail className="h-4 w-4"/> Email
                                </Label>
                                <Input
                                    id="portal-email"
                                    type="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={submitting}
                                    required
                                    className="h-12 rounded-xl border-slate-200 bg-slate-100 text-slate-800 focus-visible:bg-white"
                                />
                                {isRegister && (
                                    <p className="text-xs text-slate-500">
                                        Use the email address your account manager has on file for you.
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label
                                    htmlFor="portal-password"
                                    className="flex items-center gap-2 text-slate-700"
                                >
                                    <Lock className="h-4 w-4"/> Password
                                </Label>
                                <Input
                                    id="portal-password"
                                    type="password"
                                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={submitting}
                                    required
                                    className="h-12 rounded-xl border-slate-200 bg-slate-100 text-slate-800 focus-visible:bg-white"
                                />
                                {isRegister && <PasswordChecklist value={password}/>}
                            </div>

                            {isRegister && (
                                <div className="space-y-2">
                                    <Label
                                        htmlFor="portal-confirm"
                                        className="flex items-center gap-2 text-slate-700"
                                    >
                                        <Lock className="h-4 w-4"/> Confirm Password
                                    </Label>
                                    <Input
                                        id="portal-confirm"
                                        type="password"
                                        autoComplete="new-password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        disabled={submitting}
                                        required
                                        className="h-12 rounded-xl border-slate-200 bg-slate-100 text-slate-800 focus-visible:bg-white"
                                    />
                                </div>
                            )}

                            {error && (
                                <Alert variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}

                            <Button
                                type="submit"
                                size="xl"
                                disabled={submitting}
                                className="w-full bg-[#253984] text-[#EAF6FF] shadow-md hover:bg-[#2A2A72]"
                            >
                                {submitting
                                    ? isRegister ? 'Creating account…' : 'Logging in…'
                                    : isRegister ? 'Create Account' : 'Log In'}
                                {isRegister ? <UserPlus className="h-4 w-4"/> : <ArrowRight className="h-4 w-4"/>}
                            </Button>

                            <div className="flex items-center gap-3 pt-1 text-slate-400">
                                <div className="h-px flex-1 bg-slate-300"/>
                                <span className="text-sm">Or</span>
                                <div className="h-px flex-1 bg-slate-300"/>
                            </div>

                            <p className="text-center text-slate-600">
                                {isRegister ? (
                                    <>
                                        Already have an account?{' '}
                                        <button
                                            type="button"
                                            onClick={() => switchMode('login')}
                                            className="font-semibold text-[#253984] hover:underline"
                                        >
                                            Log in
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        First time here?{' '}
                                        <button
                                            type="button"
                                            onClick={() => switchMode('register')}
                                            className="font-semibold text-[#253984] hover:underline"
                                        >
                                            Create your account
                                        </button>
                                    </>
                                )}
                            </p>
                        </form>
                    </CardContent>
                </Card>

                <p className="mt-6 text-center text-sm text-sky-100/90">
                    Work at the company?{' '}
                    <Link to="/login" className="font-semibold underline">
                        Go to the CRM staff login
                    </Link>
                </p>
            </main>
        </div>
    )
}
