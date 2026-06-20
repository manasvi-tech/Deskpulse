import React from 'react'
import { ShieldOff } from 'lucide-react'

export default function LocationAccessDenied({ user, selectedLocation }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
      <div className="flex justify-center mb-2">
        <ShieldOff size={20} className="text-red-400" />
      </div>
      <p className="text-red-700 font-medium text-sm">Access Restricted</p>
      <p className="text-red-600 text-sm mt-1">
        Your assigned location is <strong>{user?.location_name || 'your location'}</strong> but you
        are trying to view data for{' '}
        <strong>{selectedLocation?.name || 'another location'}</strong>.
      </p>
      <p className="text-red-500 text-xs mt-2">
        Please contact your administrator if you need access to this location.
      </p>
    </div>
  )
}
