import React from 'react'
import { AlertCircle } from 'lucide-react'

export default function DemoBanner() {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2">
      <AlertCircle size={14} className="text-amber-600 shrink-0" />
      <p className="text-sm text-amber-700">
        You are viewing a live demo - write operations are disabled.
      </p>
    </div>
  )
}
