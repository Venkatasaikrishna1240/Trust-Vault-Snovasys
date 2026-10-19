/**
 * Curated security-themed quotes and micro-copy for TrustVault.
 * Professional, subtle, and security-themed.
 */

export const VAULT_QUOTES = {
  greetings: [
    'Welcome back, document guardian.',
    'The vault is locked. Your documents are safe.',
    'All perimeter sensors active and nominal.',
    'Zero breaches detected on your watch.',
    'Cryptographic integrity is holding steady.',
  ],
  loading: [
    'Checking permissions like a security guard…',
    'Consulting the cryptographic elders…',
    'Verifying tamper-evident seal…',
    'Decrypting vault metadata…',
  ],
  upload: [
    'Your files are entering the vault.',
    'Securing your files faster than you can say password123.',
    'Wrapping your document in 256 bits of protection.',
  ],
  empty: [
    'No documents yet. Even a vault needs its first treasure.',
    'A quiet vault is a secure vault… but upload something to get started.',
  ],
  accessDenied: [
    'Access denied. Nice try, secret agent.',
    'The vault door remains sealed. Clearance required.',
    'Security checkpoint: authorization missing.',
  ],
  notFound: [
    'The vault was searched, but this document has vanished or was never stored.',
    'Item not found in vault registry.',
  ],
}

export function getRandomQuote(category: keyof typeof VAULT_QUOTES): string {
  const list = VAULT_QUOTES[category]
  return list[Math.floor(Math.random() * list.length)]
}
