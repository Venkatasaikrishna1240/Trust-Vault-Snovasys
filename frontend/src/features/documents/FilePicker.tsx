import { useId, useState } from 'react'
import { AlertCircle, CheckCircle2, FileText, UploadCloud } from 'lucide-react'
import { precheckFile } from '../../lib/validation'
import { formatBytes } from '../../lib/format'

interface Props {
  label: string
  file: File | null
  onChange: (f: File | null) => void
  error?: string
}

/** File input with client-side UX prechecks (type/size). The server validates independently. */
export function FilePicker({ label, file, onChange, error }: Props) {
  const id = useId()
  const [localError, setLocalError] = useState<string | null>(null)
  const shown = localError ?? error

  return (
    <div className="w-full">
      <label htmlFor={id} className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-700">
        {label}
      </label>

      {/* Modern upload dropzone wrapper */}
      <div
        className={`relative rounded-xl border-2 border-dashed p-5 transition-all duration-150 ${
          shown
            ? 'border-rose-300 bg-rose-50/40'
            : file
            ? 'border-emerald-300 bg-emerald-50/30'
            : 'border-slate-300 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/20'
        }`}
      >
        <div className="flex flex-col items-center justify-center text-center">
          <div
            className={`mb-2.5 grid h-10 w-10 place-items-center rounded-xl border ${
              file
                ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                : 'border-blue-200 bg-blue-100/70 text-blue-600'
            }`}
          >
            {file ? (
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            ) : (
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            )}
          </div>

          <p className="text-xs font-semibold text-slate-800">
            {file ? file.name : 'Choose a file or click to browse'}
          </p>
          <p id={`${id}-d`} className="mt-1 text-2xs text-slate-500">
            PDF, PNG or JPEG, up to 10 MB.
          </p>

          <input
            id={id}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            aria-invalid={shown ? true : undefined}
            aria-describedby={`${id}-d`}
            className="mt-3 block w-full max-w-xs cursor-pointer text-xs text-slate-500 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-blue-700"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              const problem = f ? precheckFile(f) : null
              setLocalError(problem)
              if (problem) {
                e.target.value = ''
                onChange(null)
              } else {
                onChange(f)
              }
            }}
          />
        </div>
      </div>

      {file && !shown && (
        <div className="mt-2.5 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
          <div className="flex items-center gap-2 truncate">
            <FileText className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
            <span className="font-semibold truncate">{file.name}</span>
            <span className="text-emerald-700 font-mono">({formatBytes(file.size)})</span>
          </div>
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-2xs font-bold text-emerald-800">READY</span>
        </div>
      )}

      {shown && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-rose-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{shown}</span>
        </p>
      )}
    </div>
  )
}
