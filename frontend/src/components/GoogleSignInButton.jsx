import {useEffect, useRef, useState} from 'react'
import {fetchAuthConfig} from '@/api/auth'

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
let scriptPromise

const loadGisScript = () => {
    if (scriptPromise) return scriptPromise
    scriptPromise = new Promise((resolve, reject) => {
        if (typeof window === 'undefined') {
            reject(new Error('No window'))
            return
        }
        if (window.google?.accounts?.id) {
            resolve()
            return
        }
        const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`)
        if (existing) {
            existing.addEventListener('load', () => resolve())
            existing.addEventListener('error', () =>
                reject(new Error('Failed to load Google Identity Services'))
            )
            return
        }
        const script = document.createElement('script')
        script.src = SCRIPT_SRC
        script.async = true
        script.defer = true
        script.onload = () => resolve()
        script.onerror = () =>
            reject(new Error('Failed to load Google Identity Services'))
        document.head.appendChild(script)
    })
    return scriptPromise
}

export default function GoogleSignInButton({onCredential, onError, disabled}) {
    const buttonRef = useRef(null)
    const [clientId, setClientId] = useState(null)
    const [unavailable, setUnavailable] = useState(false)

    useEffect(() => {
        let cancelled = false
        fetchAuthConfig()
            .then(({googleClientId}) => {
                if (cancelled) return
                if (!googleClientId) {
                    setUnavailable(true)
                    return
                }
                setClientId(googleClientId)
            })
            .catch(() => {
                if (!cancelled) setUnavailable(true)
            })
        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (!clientId || !buttonRef.current) return
        let cancelled = false

        loadGisScript()
            .then(() => {
                if (cancelled || !buttonRef.current) return
                const google = window.google
                if (!google?.accounts?.id) {
                    onError?.('Google Identity Services not available')
                    return
                }
                google.accounts.id.initialize({
                    client_id: clientId,
                    callback: (response) => {
                        if (response?.credential) onCredential(response.credential)
                        else onError?.('No credential returned by Google')
                    },
                })
                buttonRef.current.innerHTML = ''
                google.accounts.id.renderButton(buttonRef.current, {
                    theme: 'outline',
                    size: 'large',
                    type: 'standard',
                    shape: 'pill',
                    text: 'continue_with',
                    width: 320,
                })
            })
            .catch((err) => {
                if (!cancelled) onError?.(err.message)
            })

        return () => {
            cancelled = true
        }
    }, [clientId, onCredential, onError])

    if (unavailable) {
        return (
            <p className="text-center text-sm text-sky-100/80">
                Google sign-in is not configured.
            </p>
        )
    }

    return (
        <div
            ref={buttonRef}
            className={`flex justify-center ${disabled ? 'pointer-events-none opacity-60' : ''}`}
        />
    )
}
