import {Check, Circle} from 'lucide-react'
import {checkPassword} from '@/lib/passwordPolicy'

// Live view of the password rules the server enforces, shown wherever a
// password is chosen so the requirements are visible before submitting.
export default function PasswordChecklist({value = '', highlightMissing = false}) {
    return (
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {checkPassword(value).map((rule) => (
                <li
                    key={rule.id}
                    className={`flex items-center gap-1.5 text-xs ${
                        rule.met
                            ? 'text-emerald-600'
                            : highlightMissing
                                ? 'text-red-600'
                                : 'text-slate-500'
                    }`}
                >
                    {rule.met ? (
                        <Check className="h-3.5 w-3.5 shrink-0"/>
                    ) : (
                        <Circle className="h-3 w-3 shrink-0"/>
                    )}
                    <span>{rule.label}</span>
                    <span className="sr-only">{rule.met ? ' — met' : ' — not met yet'}</span>
                </li>
            ))}
        </ul>
    )
}
