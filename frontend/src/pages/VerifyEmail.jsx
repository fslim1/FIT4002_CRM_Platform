import {useEffect, useMemo, useRef, useState} from 'react'
import {Link, useLocation, useNavigate, useSearchParams} from 'react-router-dom'
import {ArrowRight, MailCheck} from 'lucide-react'
import {useAuth} from '@/context/auth'
import {resendVerification} from '@/api/auth'
import AppHeader from '@/components/AppHeader'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Card, CardContent} from '@/components/ui/card'
import {Alert, AlertDescription} from '@/components/ui/alert'

const CODE_LENGTH = 6
const RESEND_COOLDOWN_SECONDS = 60

// Second half of sign-up: the account exists but stays unusable until the code
// emailed to the address comes back. Reached from sign-up, and from login when
// someone tries an account that was never confirmed.
export default function VerifyEmail() {
    const {verifyEmail} = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const [searchParams] = useSearchParams()
    const codeRef = useRef(null)

    const email = useMemo(
        () => (searchParams.get('email') || location.state?.email || '').trim(),
        [searchParams, location.state]
    )

    const [code, setCode] = useState('')
    const [error, setError] = useState('')
    const [notice, setNotice] = useState(location.state?.notice || '')
    const [submitting, setSubmitting] = useState(false)
    const [focusRequest, setFocusRequest] = useState(0)
    const [resending, setResending] = useState(false)
    const [cooldown, setCooldown] = useState(
        location.state?.codeSent === false ? 0 : RESEND_COOLDOWN_SECONDS
    )

    // Nothing to confirm without an address to confirm it against.
    useEffect(() => {
        if (!email) navigate('/signup', {replace: true})
    }, [email, navigate])

    // The code field is disabled while a check is in flight, so a rejected code
    // sends focus back only once the form is interactive again.
    useEffect(() => {
        if (!focusRequest || submitting) return
        codeRef.current?.focus()
    }, [focusRequest, submitting])

    useEffect(() => {
        if (cooldown <= 0) return undefined
        const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
        return () => clearInterval(timer)
    }, [cooldown])

    const refocusCode = () => setFocusRequest((count) => count + 1)

    const onCodeChange = (e) => {
        setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))
        setError('')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setNotice('')

        if (code.length !== CODE_LENGTH) {
            setError(`Enter the ${CODE_LENGTH}-digit code from your email.`)
            refocusCode()
            return
        }

        setSubmitting(true)
        try {
            await verifyEmail({email, code})
            navigate('/', {replace: true})
        } catch (err) {
            const {message, code: reason} = err?.response?.data || {}
            if (reason === 'already_verified') {
                navigate('/login', {replace: true, state: {notice: message}})
                return
            }
            setError(message || 'We could not confirm that code. Please try again.')
            setCode('')
            refocusCode()
        } finally {
            setSubmitting(false)
        }
    }

    const handleResend = async () => {
        setError('')
        setNotice('')
        setResending(true)
        try {
            const data = await resendVerification(email)
            setNotice(data.message || 'A new code is on its way.')
            setCooldown(RESEND_COOLDOWN_SECONDS)
            setCode('')
            refocusCode()
        } catch (err) {
            const {message, retryAfterSeconds} = err?.response?.data || {}
            setError(message || 'Unable to send a new code right now. Please try again shortly.')
            if (retryAfterSeconds) setCooldown(retryAfterSeconds)
        } finally {
            setResending(false)
        }
    }

    const resendLabel = resending
        ? 'Sending…'
        : cooldown > 0
            ? `Send a new code in ${cooldown}s`
            : 'Send a new code'

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
                <h1 className="mb-1 text-center text-4xl font-extrabold tracking-tight text-white drop-shadow-sm sm:text-5xl">
                    Confirm Your Email
                </h1>
                <p className="mb-8 max-w-md text-center text-lg text-sky-100/90">
                    We sent a {CODE_LENGTH}-digit code to{' '}
                    <span className="font-semibold text-white">{email}</span>
                </p>

                <Card className="w-full max-w-md rounded-3xl border-white/40 bg-white/95 shadow-2xl">
                    <CardContent className="p-8">
                        <div className="mb-6 flex justify-center">
                            <span
                                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#253984] text-[#EAF6FF]">
                                <MailCheck className="h-6 w-6"/>
                            </span>
                        </div>

                        <form onSubmit={handleSubmit} noValidate className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="code" className="text-slate-700">
                                    Verification code
                                </Label>
                                <Input
                                    id="code"
                                    ref={codeRef}
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    autoFocus
                                    placeholder="000000"
                                    value={code}
                                    onChange={onCodeChange}
                                    disabled={submitting}
                                    aria-invalid={error ? true : undefined}
                                    aria-describedby="code-hint"
                                    className="h-14 rounded-xl border-slate-200 bg-slate-100 text-center text-2xl font-semibold tracking-[0.5em] text-slate-800 focus-visible:bg-white"
                                />
                                <p id="code-hint" className="text-xs text-slate-500">
                                    The code expires 15 minutes after it is sent.
                                </p>
                            </div>

                            {error && (
                                <Alert variant="destructive">
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                            {notice && !error && (
                                <Alert>
                                    <AlertDescription>{notice}</AlertDescription>
                                </Alert>
                            )}

                            <Button
                                type="submit"
                                size="xl"
                                disabled={submitting || code.length !== CODE_LENGTH}
                                className="w-full bg-[#253984] text-[#EAF6FF] shadow-md hover:bg-[#2A2A72]"
                            >
                                {submitting ? 'Confirming…' : 'Confirm Email'}
                                <ArrowRight className="h-4 w-4"/>
                            </Button>

                            <div className="flex items-center gap-3 pt-1 text-slate-400">
                                <div className="h-px flex-1 bg-slate-300"/>
                                <span className="text-sm">Didn&apos;t get it?</span>
                                <div className="h-px flex-1 bg-slate-300"/>
                            </div>

                            <Button
                                type="button"
                                variant="outline"
                                size="xl"
                                onClick={handleResend}
                                disabled={resending || cooldown > 0}
                                className="w-full border-slate-300 text-slate-700 hover:bg-slate-100"
                            >
                                {resendLabel}
                            </Button>

                            <p className="text-center text-sm text-slate-600">
                                Wrong address?{' '}
                                <Link
                                    to="/signup"
                                    className="font-semibold text-[#253984] hover:underline"
                                >
                                    Start over
                                </Link>
                            </p>
                        </form>
                    </CardContent>
                </Card>

                <p className="mt-6 text-center text-sm text-sky-100/90">
                    Already confirmed?{' '}
                    <Link to="/login" className="font-semibold underline">
                        Log in
                    </Link>
                </p>
            </main>
        </div>
    )
}
