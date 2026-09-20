// Client-side mirror of backend/services/passwordPolicy.js, used to show the
// same requirements the server enforces while the password is being typed.
// The server re-checks every sign-up, so this only drives the UI.
export const PASSWORD_RULES = [
    {id: 'length', label: 'At least 8 characters', test: (value) => value.length >= 8},
    {id: 'uppercase', label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value)},
    {id: 'lowercase', label: 'One lowercase letter', test: (value) => /[a-z]/.test(value)},
    {id: 'number', label: 'One number', test: (value) => /[0-9]/.test(value)},
]

export const checkPassword = (value = '') =>
    PASSWORD_RULES.map((rule) => ({...rule, met: rule.test(value)}))

export const isPasswordValid = (value = '') =>
    PASSWORD_RULES.every((rule) => rule.test(value))
