import {useState} from 'react'
import {Link, useNavigate} from 'react-router-dom'
import {
    ArrowRight,
    Bell,
    BarChart3,
    Building2,
    Calendar,
    KanbanSquare,
    Lock,
    Mail,
    Target,
    User,
    Users,
} from 'lucide-react'
import {useAuth} from '@/context/auth'
import { requestGmailToken } from '@/context/AuthContext'
import AppHeader from '@/components/AppHeader'
import KanbanMock from '@/components/KanbanMock'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Card, CardContent} from '@/components/ui/card'
import {Alert, AlertDescription} from '@/components/ui/alert'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

const ROLES = ['Admin', 'Supervisor', 'User']

const GRADIENTS = {
    primary: 'linear-gradient(180deg, #FFFFFF 0%, #DDE6FF 100%)',
    warm: 'linear-gradient(180deg, #F5F8FF 0%, #CBD9FF 100%)',
    fresh:
        'linear-gradient(180deg, #E9F0FF 0%, #B9CCFF 50%, #93AEF5 100%)',
}

const FEATURES = [
    {
        title: 'Kanban Board',
        icon: KanbanSquare,
        body: 'Visualize your sales pipeline with drag-and-drop task management. Move deals through stages effortlessly.',
        background: GRADIENTS.primary,
        placement: 'lg:col-start-1 lg:row-start-1 lg:row-span-2',
    },
    {
        title: 'Analytics & Reports',
        icon: BarChart3,
        body: 'Track performance with detailed insights. Make data-driven decisions to boost revenue.',
        background: GRADIENTS.warm,
        placement: 'lg:col-start-4 lg:row-start-1 lg:row-span-2',
    },
    {
        title: 'Smart Notifications',
        icon: Bell,
        body: 'Never miss a follow-up. Get intelligent alerts for overdue tasks, inactive customers, and more.',
        background: GRADIENTS.fresh,
        placement: 'lg:col-start-2 lg:row-start-2 lg:row-span-2',
    },
    {
        title: 'Calendar View',
        icon: Calendar,
        body: 'See all your tasks and deadlines at a glance. Plan with confidence.',
        background: GRADIENTS.fresh,
        placement: 'lg:col-start-3 lg:row-start-2 lg:row-span-2',
    },
    {
        title: 'Team Collaboration',
        icon: Users,
        body: 'Assign tasks, share updates, and keep everyone aligned. Work together seamlessly in real-time.',
        background: GRADIENTS.warm,
        placement: 'lg:col-start-1 lg:row-start-3 lg:row-span-2',
    },
    {
        title: 'Pipeline Stages',
        icon: Target,
        body: 'Customize your sales process. Track deals from first contact to closed won.',
        background: GRADIENTS.primary,
        placement: 'lg:col-start-4 lg:row-start-3 lg:row-span-2',
    },
]

export default function Signup() {
    const {signup} = useAuth()
    const navigate = useNavigate()

    const [form, setForm] = useState({
        fullName: '',
        email: '',
        password: '',
        companyName: '',
        role: 'User',
    })
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const onChange = (e) =>
        setForm((prev) => ({...prev, [e.target.name]: e.target.value}))

    const onRoleChange = (value) =>
        setForm((prev) => ({...prev, role: value}))

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')

        if (
            !form.fullName ||
            !form.email ||
            !form.password ||
            !form.companyName
        ) {
            setError('Please fill in every field.')
            return
        }
        if (form.fullName.trim().length > 120) {
            setError('Full name cannot be more than 120 characters.')
            return
        }
        if (form.password.length < 8) {
            setError('Password must be at least 8 characters.')
            return
        }
        if (!ROLES.includes(form.role)) {
            setError('Please select a valid role.')
            return
        }

        setSubmitting(true)
        try {
            const gmailAccessToken = await requestGmailToken()

            await signup({
                fullName: form.fullName.trim(),
                email: form.email.trim(),
                password: form.password,
                companyName: form.companyName.trim(),
                role: form.role,
                gmailAccessToken,
            })
            navigate('/', {replace: true})
        } catch (err) {
            if (err?.error === 'access_denied' || err?.message?.includes('closed')) {
                setError('Google authorization was canceled. Please approve access to create your account.')
            } else {
                setError(
                    err?.response?.data?.message ||
                    'Unable to create your account. Please try again.'
                )
            }
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#1B1C3A]">
            <AppHeader/>

            <section
                className="px-6 py-12"
                style={{
                    backgroundImage:
                        'linear-gradient(135deg, #1B1C3A 0%, #253984 55%, #2A2A72 100%)',
                }}
            >
                <div
                    className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-20 xl:gap-28">
                    <div>
                        <h1 className="mb-8 text-5xl font-extrabold leading-tight text-white drop-shadow-sm sm:text-6xl">
                            Close More Deals,
                            <br/>
                            Faster than Ever
                        </h1>

                        <Card className="rounded-3xl border-white/40 bg-white/95 shadow-2xl">
                            <CardContent className="p-7">
                                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                                    <Field
                                        label="Full Name"
                                        icon={User}
                                        name="fullName"
                                        value={form.fullName}
                                        onChange={onChange}
                                        autoComplete="name"
                                        disabled={submitting}
                                    />
                                    <Field
                                        label="Work Email"
                                        icon={Mail}
                                        type="email"
                                        name="email"
                                        value={form.email}
                                        onChange={onChange}
                                        autoComplete="email"
                                        disabled={submitting}
                                    />
                                    <Field
                                        label="Password"
                                        icon={Lock}
                                        type="password"
                                        name="password"
                                        value={form.password}
                                        onChange={onChange}
                                        autoComplete="new-password"
                                        disabled={submitting}
                                    />
                                    <Field
                                        label="Company Name"
                                        icon={Building2}
                                        name="companyName"
                                        value={form.companyName}
                                        onChange={onChange}
                                        autoComplete="organization"
                                        disabled={submitting}
                                    />

                                    <div className="space-y-2">
                                        <Label htmlFor="role" className="text-slate-700">
                                            Role
                                        </Label>
                                        <Select
                                            value={form.role}
                                            onValueChange={onRoleChange}
                                            disabled={submitting}
                                        >
                                            <SelectTrigger
                                                id="role"
                                                className="h-12 rounded-xl border-slate-200 bg-slate-100 text-slate-800"
                                            >
                                                <SelectValue placeholder="Select a role"/>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ROLES.map((r) => (
                                                    <SelectItem key={r} value={r}>
                                                        {r}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

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
                                        {submitting ? 'Creating account…' : 'Create Your Account'}
                                        <ArrowRight className="h-4 w-4"/>
                                    </Button>

                                    <p className="pt-1 text-center text-sm text-slate-600">
                                        Already have an account?{' '}
                                        <Link
                                            to="/login"
                                            className="font-semibold text-[#253984] hover:underline"
                                        >
                                            Log in
                                        </Link>
                                    </p>
                                </form>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="hidden justify-end lg:flex xl:pl-12">
                        <KanbanMock/>
                    </div>
                </div>
            </section>

            <section className="bg-slate-200 px-6 py-12">
                <div className="mx-auto max-w-6xl">
                    <div className="mb-10 text-center lg:hidden">
                        <FeaturesHeading/>
                    </div>

                    <div
                        className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-1 lg:[grid-template-rows:repeat(4,minmax(120px,1fr))]">
                        <div
                            className="hidden text-center lg:col-span-2 lg:col-start-2 lg:row-start-1 lg:flex lg:flex-col lg:items-center lg:justify-center lg:px-4">
                            <FeaturesHeading/>
                        </div>
                        {FEATURES.map((f) => (
                            <FeatureCard key={f.title} {...f} />
                        ))}
                    </div>
                </div>
            </section>
        </div>
    )
}

function Field({label, icon: Icon, name, ...inputProps}) {
    return (
        <div className="space-y-2">
            <Label
                htmlFor={name}
                className="flex items-center gap-2 text-slate-700"
            >
                {Icon ? <Icon className="h-4 w-4"/> : null}
                {label}
            </Label>
            <Input
                id={name}
                name={name}
                required
                className="h-12 rounded-xl border-slate-200 bg-slate-100 text-slate-800 focus-visible:bg-white"
                {...inputProps}
            />
        </div>
    )
}

function FeatureCard({title, body, icon: Icon, background, placement}) {
    return (
        <Card
            className={`rounded-2xl border-transparent text-[#232528] shadow-md ${placement || ''}`}
            style={{backgroundImage: background}}
        >
            <CardContent className="p-6">
                <div
                    className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#253984] text-[#EAF6FF]">
                    <Icon className="h-5 w-5"/>
                </div>
                <h3 className="mb-2 text-lg font-bold text-[#232528]">{title}</h3>
                <p className="text-sm text-[#555555]">{body}</p>
            </CardContent>
        </Card>
    )
}

function FeaturesHeading() {
    return (
        <>
            <h2 className="text-3xl font-bold text-[#232528]">
                Everything You Need To Succeed
            </h2>
            <p className="mt-2 text-[#555555]">
                Powerful features designed to help your sales team work smarter, not
                harder
            </p>
        </>
    )
}
