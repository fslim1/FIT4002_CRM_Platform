const dns = require('dns')
const net = require('net')
const os = require('os')
const {domainToASCII} = require('url')

// Checks that an email address really exists before an account is created.
//
// A valid format proves nothing about a mailbox, so an address is accepted
// only once its domain is shown to accept mail (DNS MX lookup, falling back
// to the address records an implicit MX allows) and, where the network
// permits it, the mailbox itself is confirmed with an SMTP RCPT TO probe.
//
// Mail servers that neither confirm nor deny a mailbox — catch-all domains,
// greylisting, or a hosting provider that blocks outbound port 25 — produce
// an "unknown" verdict, which is allowed through: a real address must never
// be rejected because of a limitation on our side. Only a definitive
// "this mailbox does not exist" answer blocks the sign-up.

const VERDICT = {
    DELIVERABLE: 'deliverable',
    UNDELIVERABLE: 'undeliverable',
    UNKNOWN: 'unknown',
}

const SMTP_PORT = 25
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX_ENTRIES = 500
const PROBE_SUSPEND_MS = 15 * 60 * 1000

// DNS errors that mean "this name has no such record", as opposed to a
// resolver that is unreachable or misbehaving.
const NO_RECORD_CODES = new Set([
    dns.NOTFOUND,
    dns.NODATA,
    dns.NONAME,
    'ENOTFOUND',
    'ENODATA',
])

// Wording used by mail servers when the rejection is about the sender or a
// policy rather than the recipient. Those must not fail a sign-up.
const POLICY_REJECTION = /5\.7\.|spam|blacklist|blocklist|black list|block list|blocked|denied|not allowed|policy|reputation|reverse dns|rdns|ptr record|greylist|rate limit|too many/i

const readConfig = () => {
    const heloName = process.env.EMAIL_VERIFICATION_HELO || os.hostname() || 'localhost'
    const timeout = Number(process.env.EMAIL_VERIFICATION_TIMEOUT_MS)

    return {
        enabled: process.env.EMAIL_VERIFICATION !== 'off',
        // The mailbox probe can be turned off on networks that block port 25,
        // leaving the (much faster) domain check in place.
        smtpProbe: process.env.EMAIL_VERIFICATION_SMTP !== 'off',
        timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 5000,
        heloName,
        probeSender: process.env.EMAIL_VERIFICATION_FROM || `no-reply@${heloName}`,
    }
}

const result = (verdict, reason, message) => ({
    ok: verdict !== VERDICT.UNDELIVERABLE,
    verdict,
    reason,
    message: message || null,
})

// Structural validation beyond the "something@something.something" shape:
// catches the malformed addresses a DNS or SMTP lookup would never reach.
const parseAddress = (email) => {
    if (typeof email !== 'string') return null

    const trimmed = email.trim()
    if (!trimmed || trimmed.length > 254 || /\s/.test(trimmed)) return null

    const at = trimmed.lastIndexOf('@')
    if (at <= 0 || at === trimmed.length - 1) return null

    const local = trimmed.slice(0, at)
    const domain = trimmed.slice(at + 1).replace(/\.$/, '').toLowerCase()

    if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
        return null
    }

    const asciiDomain = domainToASCII(domain)
    if (!asciiDomain || asciiDomain.length > 253) return null

    const labels = asciiDomain.split('.')
    if (labels.length < 2) return null
    const validLabel = (label) =>
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9-]+$/.test(label) &&
        !label.startsWith('-') &&
        !label.endsWith('-')
    if (!labels.every(validLabel)) return null
    // A real top-level domain is alphabetic, or punycode for a non-Latin one.
    if (!/^([a-z]{2,}|xn--[a-z0-9-]{2,})$/.test(labels[labels.length - 1])) return null

    return {address: `${local}@${asciiDomain}`, local, domain: asciiDomain}
}

// Mail exchangers for a domain, best priority first. An empty list means the
// domain accepts no mail at all; `null` means DNS could not answer.
const resolveMailHosts = async (domain, timeoutMs) => {
    const resolver = new dns.promises.Resolver({timeout: timeoutMs, tries: 2})
    let answered = false

    const lookup = async (method) => {
        try {
            const records = await resolver[method](domain)
            answered = true
            return records
        } catch (err) {
            if (NO_RECORD_CODES.has(err.code)) answered = true
            return []
        }
    }

    const mxRecords = await lookup('resolveMx')
    if (mxRecords.length > 0) {
        // An MX record set with nothing but an empty exchange is RFC 7505's
        // "null MX": the domain states outright that it accepts no mail, and
        // the address-record fallback below must not override it.
        return mxRecords
            .filter((record) => record && typeof record.exchange === 'string')
            .sort((a, b) => a.priority - b.priority)
            .map((record) => record.exchange.replace(/\.$/, '').trim())
            .filter(Boolean)
    }

    // RFC 5321: with no MX record at all, an address record makes the domain
    // its own mail exchanger.
    const [a, aaaa] = [await lookup('resolve4'), await lookup('resolve6')]
    if (a.length > 0 || aaaa.length > 0) return [domain]

    return answered ? [] : null
}

// One SMTP conversation: greet, introduce ourselves, then ask the server
// whether it would accept mail for this recipient. Nothing is ever sent.
const probeMailbox = ({host, address, config}) =>
    new Promise((resolve) => {
        const socket = net.createConnection({host, port: SMTP_PORT})
        let settled = false
        let stage = 'greeting'
        let buffer = ''

        const finish = (verdict, reason) => {
            if (settled) return
            settled = true
            socket.destroy()
            resolve({verdict, reason})
        }

        // Pulls one complete SMTP reply out of the buffer. Multi-line replies
        // use "250-" for continuations and "250 " for the final line.
        const takeReply = () => {
            const lines = buffer.split('\n')
            for (let i = 0; i < lines.length - 1; i += 1) {
                const line = lines[i].replace(/\r$/, '')
                if (/^\d{3}(\s|$)/.test(line)) {
                    const text = lines.slice(0, i + 1).join('\n')
                    buffer = lines.slice(i + 1).join('\n')
                    return {code: Number(line.slice(0, 3)), text}
                }
            }
            return null
        }

        const send = (line) => socket.write(`${line}\r\n`)

        const classifyRecipientReply = ({code, text}) => {
            if (code === 250 || code === 251) return VERDICT.DELIVERABLE
            // 252: "cannot verify, but will attempt delivery" — a catch-all.
            if (code === 252 || code < 400) return VERDICT.UNKNOWN
            // 4xx is a temporary condition, never proof of a missing mailbox.
            if (code < 500) return VERDICT.UNKNOWN
            if (POLICY_REJECTION.test(text)) return VERDICT.UNKNOWN
            if (code === 550 || code === 551 || code === 553) return VERDICT.UNDELIVERABLE
            return VERDICT.UNKNOWN
        }

        const handleReply = (reply) => {
            const {code} = reply

            if (stage === 'greeting') {
                if (code !== 220) return finish(VERDICT.UNKNOWN, 'smtp_greeting_refused')
                stage = 'ehlo'
                return send(`EHLO ${config.heloName}`)
            }
            if (stage === 'ehlo') {
                if (code >= 300) return finish(VERDICT.UNKNOWN, 'smtp_ehlo_refused')
                stage = 'mail'
                return send(`MAIL FROM:<${config.probeSender}>`)
            }
            if (stage === 'mail') {
                if (code >= 300) return finish(VERDICT.UNKNOWN, 'smtp_sender_refused')
                stage = 'rcpt'
                return send(`RCPT TO:<${address}>`)
            }
            if (stage === 'rcpt') {
                const verdict = classifyRecipientReply(reply)
                stage = 'quit'
                send('QUIT')
                return finish(
                    verdict,
                    verdict === VERDICT.UNDELIVERABLE ? 'mailbox_not_found' : 'smtp_inconclusive'
                )
            }
        }

        socket.setTimeout(config.timeoutMs)
        socket.on('timeout', () => finish(VERDICT.UNKNOWN, 'smtp_timeout'))
        socket.on('error', () => finish(VERDICT.UNKNOWN, 'smtp_unreachable'))
        socket.on('close', () => finish(VERDICT.UNKNOWN, 'smtp_closed'))
        socket.on('data', (chunk) => {
            buffer += chunk.toString('utf8')
            let reply = takeReply()
            while (reply && !settled) {
                handleReply(reply)
                reply = settled ? null : takeReply()
            }
        })
    })

// Hosting networks commonly block outbound port 25. The first timeout says so
// clearly enough, so the probe is suspended for a while rather than making
// every sign-up wait for it; the domain check keeps running throughout.
let probeSuspendedUntil = 0

// Sign-up is rate limited, but a short-lived cache still keeps repeated
// attempts with the same address off the network.
const cache = new Map()

const readCache = (key) => {
    const entry = cache.get(key)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
        cache.delete(key)
        return null
    }
    return entry.value
}

const writeCache = (key, value) => {
    if (cache.size >= CACHE_MAX_ENTRIES) {
        for (const [cachedKey, entry] of cache) {
            if (entry.expiresAt <= Date.now()) cache.delete(cachedKey)
        }
        if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value)
    }
    cache.set(key, {value, expiresAt: Date.now() + CACHE_TTL_MS})
}

const verifyEmailExists = async (email) => {
    const parsed = parseAddress(email)
    if (!parsed) {
        return result(
            VERDICT.UNDELIVERABLE,
            'invalid_format',
            'Please provide a valid email address.'
        )
    }

    const config = readConfig()
    if (!config.enabled) return result(VERDICT.UNKNOWN, 'verification_disabled')

    const cached = readCache(parsed.address)
    if (cached) return cached

    let outcome
    try {
        const hosts = await resolveMailHosts(parsed.domain, config.timeoutMs)

        if (hosts === null) {
            // The resolver itself failed: allow the sign-up rather than block
            // someone over an outage we cannot see past.
            outcome = result(VERDICT.UNKNOWN, 'dns_unavailable')
        } else if (hosts.length === 0) {
            outcome = result(
                VERDICT.UNDELIVERABLE,
                'no_mail_server',
                `No mailbox can exist at "${parsed.domain}" because the domain does not receive email. Please check the spelling of your email address.`
            )
        } else if (!config.smtpProbe) {
            outcome = result(VERDICT.UNKNOWN, 'smtp_probe_disabled')
        } else if (probeSuspendedUntil > Date.now()) {
            outcome = result(VERDICT.UNKNOWN, 'smtp_probe_unavailable')
        } else {
            outcome = result(VERDICT.UNKNOWN, 'smtp_unreachable')

            // Fall through to the backup exchanger when the first one is down.
            for (const host of hosts.slice(0, 2)) {
                const probe = await probeMailbox({host, address: parsed.address, config})

                if (probe.verdict === VERDICT.UNDELIVERABLE) {
                    outcome = result(
                        VERDICT.UNDELIVERABLE,
                        probe.reason,
                        'This email address does not exist. Please check the spelling or use a different address.'
                    )
                    break
                }
                if (probe.verdict === VERDICT.DELIVERABLE) {
                    outcome = result(VERDICT.DELIVERABLE, 'mailbox_confirmed')
                    break
                }

                outcome = result(VERDICT.UNKNOWN, probe.reason)
                if (probe.reason === 'smtp_timeout') {
                    probeSuspendedUntil = Date.now() + PROBE_SUSPEND_MS
                    break
                }
            }
        }
    } catch (err) {
        console.error('Email verification error:', err)
        return result(VERDICT.UNKNOWN, 'verification_failed')
    }

    writeCache(parsed.address, outcome)
    return outcome
}

module.exports = {verifyEmailExists, VERDICT, parseAddress}
