import { z } from 'zod'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const ALLOWED_MIME = ['application/pdf', 'image/png', 'image/jpeg'] as const

/** UX-only precheck. The server validates content independently. Returns an error message or null. */
export function precheckFile(file: { type: string; size: number }): string | null {
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) return 'Only PDF, PNG or JPEG files are allowed.'
  if (file.size <= 0) return 'The file is empty.'
  if (file.size > MAX_UPLOAD_BYTES) return 'The file is larger than the 10 MB limit.'
  return null
}

const category = z.enum(['general', 'contract', 'salary_letter', 'technical_drawing', 'audit', 'customer_record'])

export const metadataSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be 200 characters or fewer'),
  description: z.string().max(2000, 'Description must be 2000 characters or fewer'),
  category,
})
export type MetadataValues = z.infer<typeof metadataSchema>

export const signInSchema = z.object({
  email: z.string().trim().email('Enter a valid e-mail address'),
  password: z.string().min(1, 'Password is required'),
})

export const signUpSchema = z.object({
  displayName: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  email: z.string().trim().email('Enter a valid e-mail address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
})

export const shareSchema = z.object({
  email: z.string().trim().email('Enter a valid e-mail address'),
  permission: z.enum(['read', 'edit']),
})
