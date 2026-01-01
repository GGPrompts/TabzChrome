import React, { useState, useEffect, useMemo } from 'react'

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 21) return 'Good evening'
  return 'Good night'
}

export function ClockWidget() {
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    // Update every second
    const interval = setInterval(() => {
      setTime(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const hours = time.getHours().toString().padStart(2, '0')
  const minutes = time.getMinutes().toString().padStart(2, '0')
  const seconds = time.getSeconds().toString().padStart(2, '0')

  const dateString = useMemo(() => {
    return time.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }, [time.toDateString()])

  const greeting = useMemo(() => {
    return getGreeting(time.getHours())
  }, [time.getHours()])

  return (
    <div className="clock-widget animate-slide-up">
      <div className="clock-time">
        {hours}
        <span className="separator">:</span>
        {minutes}
        <span className="separator text-[var(--text-muted)] text-[3rem]">:</span>
        <span className="text-[2.5rem] text-[var(--text-secondary)]">{seconds}</span>
      </div>
      <div className="clock-date">{dateString}</div>
      <div className="clock-greeting">{greeting}</div>
    </div>
  )
}
