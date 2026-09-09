import {cn} from '@/lib/utils'
import logo from '@/assets/CRM_logo.png'

export default function AppHeader({actions, className}) {
    return (
        <header
            className={cn(
                'flex items-center justify-between gap-4 px-6 py-3',
                className
            )}
            style={{
                background: 'transparent',
                borderBottom: '1px solid rgba(234,246,255,0.12)',
            }}
        >
            <div className="flex items-center gap-4">
                <img
                    src={logo}
                    alt="NexGen CRM"
                    className="h-22 w-36 object-contain"
                />
                <div className="h-12 w-px" style={{ background: 'rgba(234,246,255,0.25)' }}/>
                <p className="text-base font-semibold" style={{ color: '#EAF6FF' }}>
                    Next Generation CRM Platform
                </p>
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
    )
}