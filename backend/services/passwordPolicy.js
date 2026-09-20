// The single definition of what makes an acceptable password, applied
// everywhere one is set: staff sign-up and the customer portal.
//
// A password must be at least eight characters and contain an uppercase
// letter, a lowercase letter and a number. The rules are exported as data so
// the sign-up forms can show the same checklist the server enforces.

const MIN_LENGTH = 8

const PASSWORD_RULES = [
    {id: 'length', label: `At least ${MIN_LENGTH} characters`, test: (value) => value.length >= MIN_LENGTH},
    {id: 'uppercase', label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value)},
    {id: 'lowercase', label: 'One lowercase letter', test: (value) => /[a-z]/.test(value)},
    {id: 'number', label: 'One number', test: (value) => /[0-9]/.test(value)},
]

const POLICY_MESSAGE =
    'Password must be at least 8 characters and include an uppercase letter, a lowercase letter and a number'

const validatePassword = (password) => {
    if (typeof password !== 'string' || !password) {
        return {ok: false, failed: PASSWORD_RULES.map((rule) => rule.id), message: POLICY_MESSAGE}
    }

    const failed = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.id)
    return {ok: failed.length === 0, failed, message: failed.length ? POLICY_MESSAGE : null}
}

module.exports = {MIN_LENGTH, PASSWORD_RULES, POLICY_MESSAGE, validatePassword}
