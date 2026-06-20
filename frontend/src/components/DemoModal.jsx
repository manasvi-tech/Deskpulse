import React from 'react'
import { Lock } from 'lucide-react'

export function DemoModal({ action, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 border border-slate-200 shadow-lg">
        <div className="flex justify-center mb-3">
          <Lock size={24} className="text-slate-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 text-center mb-2">
          Not Available in Demo
        </h2>
        <p className="text-sm text-slate-500 text-center mb-5">
          This action is disabled in the demo environment. In a production deployment, you would be
          able to {action || 'perform this action'}.
        </p>
        <button
          onClick={onClose}
          className="bg-sky-500 hover:bg-sky-600 text-white rounded-lg px-4 py-2 w-full font-medium transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
