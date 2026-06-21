import { useEffect, useRef, useCallback, useState } from 'react'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const TOUR_KEY    = 'deskpulse_tour_completed'
const CONFIRM_MSG = 'Are you sure you want to skip the tour? You can restart it from the dashboard.'

function cleanupDriverDOM() {
  document.querySelectorAll('.driver-overlay').forEach((el) => el.remove())
  document.querySelectorAll('.driver-popover').forEach((el) => el.remove())
}

function waitForLiveEvent() {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 8000)
    const handleMessage = (event) => {
      const data = event.detail
      if (['CHECKIN_EVENT', 'CHECKOUT_EVENT', 'PAYMENT_EVENT'].includes(data?.type)) {
        clearTimeout(timeout)
        window.removeEventListener('deskpulse-ws-event', handleMessage)
        resolve()
      }
    }
    window.addEventListener('deskpulse-ws-event', handleMessage)
  })
}

// ── Step builders ─────────────────────────────────────────────────────────────

function buildAdminSteps(navigate, driverRef, markDone) {
  const destroyTour = () => {
    const d = driverRef.current
    driverRef.current = null
    if (d) { try { d.destroy() } catch (_) {} }
    cleanupDriverDOM()
  }

  // X on non-final steps: show confirm dialog
  const closeHandlerNonFinal = () => {
    const ok = window.confirm(CONFIRM_MSG)
    if (ok) { markDone(); destroyTour() }
    // if !ok, do nothing - driver stays open
  }

  // X on final step: close silently, no dialog
  const closeHandlerFinal = () => {
    markDone()
    destroyTour()
  }

  const goTo = (path) => {
    navigate(path)
    setTimeout(() => driverRef.current?.moveNext(), 600)
  }

  return [
    // 0 - Welcome
    {
      popover: {
        title: 'Welcome to DeskPulse',
        description:
          'Real-time operations intelligence for co-working space chains. This quick tour will walk you through what you can see and do as a Super Admin. You have full visibility across all 10 locations.',
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 1 - Summary bar
    {
      element: '[data-tour="summary-bar"]',
      popover: {
        title: 'Live overview - all locations',
        description:
          "This bar shows what is happening across all 10 locations right now. Total members currently in office, today's revenue, and the count of active alerts requiring attention. All update live via WebSocket.",
        side: 'bottom',
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 2 - Location switcher
    {
      element: '[data-tour="location-switcher"]',
      popover: {
        title: 'Switch between locations',
        description:
          'As Super Admin you can view any of the 10 locations. Click to open the dropdown and switch - all dashboard widgets update instantly without a page reload.',
        side: 'bottom',
        align: 'end',
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 3 - Live occupancy
    {
      element: '[data-tour="live-occupancy"]',
      popover: {
        title: 'Live occupancy',
        description:
          'Shows how many members are currently in the selected location as a count and percentage of capacity. Color changes from green to amber to red as the space fills up. Updates within 1 second of any check-in or checkout event.',
        side: 'right',
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 4 - Activity feed → navigate to simulator on next
    {
      element: '[data-tour="activity-feed"]',
      popover: {
        title: 'Live activity feed',
        description:
          'Every check-in, checkout, and membership payment appears here in real time across all locations. Let us start the simulator so you can see this fill up with live events.',
        side: 'left',
        onNextClick: () => goTo('/simulator'),
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 5 - Simulator controls → navigate to dashboard and wait for live event on next
    {
      element: '[data-tour="simulator-controls"]',
      popover: {
        title: 'Start the simulator',
        description:
          'The simulator generates realistic check-in, checkout, and payment events based on real co-working patterns. Start it at 5x speed to see the dashboard come alive. Click Next when you are ready to continue.',
        side: 'bottom',
        nextBtnText: 'I started it, show me →',
        onNextClick: async () => {
          navigate('/dashboard')
          await waitForLiveEvent()
          driverRef.current?.moveNext()
        },
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 6 - Activity feed (live events flowing) → navigate to anomalies on next
    {
      element: '[data-tour="activity-feed"]',
      popover: {
        title: 'Live events are flowing',
        description:
          'Watch the activity feed update in real time as the simulator runs. Every check-in, checkout, and payment appears here within 1 second of the event being recorded in the database. This is powered by WebSocket - no polling, no page refreshes.',
        side: 'left',
        onNextClick: () => goTo('/anomalies'),
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 7 - Anomaly table → navigate to analytics on next
    {
      element: '[data-tour="anomaly-table"]',
      popover: {
        title: 'Automated anomaly detection',
        description:
          'The system checks every 30 seconds for 4 conditions: locations with no activity, spaces over 90% capacity, revenue drops vs last week, and high no-show rates. Warnings can be dismissed. Critical alerts cannot. The badge in the sidebar updates live.',
        side: 'bottom',
        onNextClick: () => goTo('/analytics'),
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 8 - Heatmap
    {
      element: '[data-tour="heatmap"]',
      popover: {
        title: 'Peak hours heatmap',
        description:
          'Shows check-in patterns across every hour of every day for the last 7 days at the selected location. Identify your busiest periods at a glance - darker cells mean more activity.',
        side: 'bottom',
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 9 - Revenue chart
    {
      element: '[data-tour="revenue-chart"]',
      popover: {
        title: 'Revenue by plan type',
        description:
          'Daily revenue broken down by membership plan - day pass, hot desk, dedicated desk, and private office. Use the date range selector to switch between 7, 30, and 90 day views.',
        side: 'top',
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 10 - Churn panel → navigate to members on next
    {
      element: '[data-tour="churn-panel"]',
      popover: {
        title: 'Member churn risk',
        description:
          'Members whose memberships are expiring within 7 days, and members who have not checked in for 30+ days. Proactive visibility so you can reach out before losing them.',
        side: 'top',
        onNextClick: () => goTo('/members'),
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 11 - Members list
    {
      element: '[data-tour="members-list"]',
      popover: {
        title: 'Member management',
        description:
          'Search and manage all 1,500 members across every location. Click any member to view their details, check them in or out manually, renew their membership, or change their plan.',
        side: 'right',
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 12 - Member detail
    {
      element: '[data-tour="member-detail"]',
      popover: {
        title: 'Member detail panel',
        description:
          'Select any member from the list to see their current check-in status, active membership, expiry date, and quick actions. Renewal and plan changes happen here - the revenue ticker on the dashboard updates the moment a payment is recorded.',
        side: 'left',
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 13 - Members nav (FINAL STEP)
    {
      element: '[data-tour="members-nav"]',
      popover: {
        title: 'You are all set',
        description:
          'The Members section in the sidebar is your home for everything membership-related - adding new members, managing existing ones, handling check-ins and checkouts, and renewing plans. Explore freely. You can restart this tour anytime from the dashboard.',
        side: 'right',
        doneBtnText: 'Got it, let me explore',
        onCloseClick: closeHandlerFinal,
      },
    },
  ]
}

function buildFrontdeskSteps(navigate, driverRef, markDone) {
  const destroyTour = () => {
    const d = driverRef.current
    driverRef.current = null
    if (d) { try { d.destroy() } catch (_) {} }
    cleanupDriverDOM()
  }

  const closeHandlerNonFinal = () => {
    const ok = window.confirm(CONFIRM_MSG)
    if (ok) { markDone(); destroyTour() }
  }

  const closeHandlerFinal = () => {
    markDone()
    destroyTour()
  }

  const goTo = (path) => {
    navigate(path)
    setTimeout(() => driverRef.current?.moveNext(), 600)
  }

  return [
    // 0 - Welcome
    {
      popover: {
        title: 'Welcome to DeskPulse',
        description:
          'You are logged in as frontdesk staff. You have full visibility of your assigned location and can manage members, handle check-ins and checkouts, and view anomalies for your space.',
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 1 - Summary bar
    {
      element: '[data-tour="summary-bar"]',
      popover: {
        title: 'Your location at a glance',
        description:
          "Current occupancy, today's revenue, and active alerts - all for your assigned location.",
        side: 'bottom',
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 2 - Live occupancy
    {
      element: '[data-tour="live-occupancy"]',
      popover: {
        title: 'Live occupancy',
        description:
          'How many members are in your space right now as a count and percentage. Updates within 1 second of any check-in or checkout.',
        side: 'right',
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 3 - Activity feed → navigate to anomalies on next
    {
      element: '[data-tour="activity-feed"]',
      popover: {
        title: 'Activity feed',
        description:
          'Every event at your location appears here in real time - check-ins, checkouts, and payments.',
        side: 'left',
        onNextClick: () => goTo('/anomalies'),
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 4 - Anomaly table → navigate to members on next
    {
      element: '[data-tour="anomaly-table"]',
      popover: {
        title: 'Alerts for your location',
        description:
          'Automated alerts specific to your location. Warning alerts can be dismissed once handled.',
        side: 'bottom',
        onNextClick: () => goTo('/members'),
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 5 - Members list
    {
      element: '[data-tour="members-list"]',
      popover: {
        title: 'Your members',
        description:
          'All members at your location. Search by name or email, click any member to check them in or out, view their membership status, or process a renewal.',
        side: 'right',
        onCloseClick: closeHandlerNonFinal,
      },
    },
    // 6 - Members nav (FINAL STEP)
    {
      element: '[data-tour="members-nav"]',
      popover: {
        title: 'You are all set',
        description:
          'The Members section is where you will spend most of your time - managing check-ins, checkouts, and memberships for your location. You can restart this tour anytime from the dashboard.',
        side: 'right',
        doneBtnText: 'Got it, let me explore',
        onCloseClick: closeHandlerFinal,
      },
    },
  ]
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTour(user, navigate) {
  const driverRef = useRef(null)

  const [tourCompleted, setTourCompleted] = useState(
    () => localStorage.getItem(TOUR_KEY) === 'true'
  )

  const markDone = useCallback(() => {
    localStorage.setItem(TOUR_KEY, 'true')
    setTourCompleted(true)
  }, [])

  const startTour = useCallback(() => {
    if (!user?.role) return

    // Tear down any existing instance
    if (driverRef.current) {
      try { driverRef.current.destroy() } catch (_) {}
      driverRef.current = null
    }
    cleanupDriverDOM()

    const steps =
      user.role === 'super_admin'
        ? buildAdminSteps(navigate, driverRef, markDone)
        : buildFrontdeskSteps(navigate, driverRef, markDone)

    const d = driver({
      animate: true,
      overlayOpacity: 0.75,
      stagePadding: 10,
      allowClose: false,
      allowKeyboardControl: false,
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Got it, let me explore',
      onComplete: () => {
        // Fires when "Got it, let me explore" is clicked on the final step.
        // driver.js auto-destroys after this callback returns - we just mark
        // done and schedule DOM cleanup after driver finishes its own teardown.
        markDone()
        driverRef.current = null
        requestAnimationFrame(cleanupDriverDOM)
      },
      steps,
    })

    driverRef.current = d
    d.drive()
  }, [user?.role, navigate, markDone])

  // Auto-start on first login
  useEffect(() => {
    if (!user?.id) return
    if (localStorage.getItem(TOUR_KEY) === 'true') return
    const timer = setTimeout(startTour, 1000)
    return () => clearTimeout(timer)
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return { startTour, tourCompleted }
}
