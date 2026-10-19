import { useId, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { precheckFile } from '../../lib/validation'
import { formatBytes } from '../../lib/format'

interface Props { label: string; file: File | null; onChange: (f: File | null) => void; error?: string }

/** File input with client-side UX prechecks (type/size). The server validates independently. */
export function FilePicker({ label, file, onChange, error }: Props) {
  const id = useId()
  const [localError, setLocalError] = useState<string | null>(null)
  const shown = localError ?? error
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <input id={id} type="file" accept="application/pdf,image/png,image/jpeg"
        aria-invalid={shown ? true : undefined} aria-describedby={`${id}-d`}
        className="block w-full rounded-lg border border-slate-300 bg-white text-sm text-slate-600 file:mr-3 file:h-10 file:border-0 file:bg-slate-100 file:px-4 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          const problem = f ? precheckFile(f) : null
          setLocalError(problem)
          if (problem) { e.target.value = ''; onChange(null) } else onChange(f)
        }} />
      <p id={`${id}-d`} className="mt-1.5 text-xs text-slate-500">PDF, PNG or JPEG, up to 10 MB.</p>
      {file && !shown && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-600"><Paperclip className="h-3.5 w-3.5" aria-hidden="true" /><span>{file.name}</span> ({formatBytes(file.size)})</p>}
      {shown && <p role="alert" className="mt-1.5 text-xs text-red-600">{shown}</p>}
    </div>
  )
}
