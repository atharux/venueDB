import { useCallback, useEffect, useRef, useState } from 'react'
import type { Venue, VenueDraft } from './types'
import { clearInvalidPhones, deleteDuplicateVenues, listVenues, removeVenue, restoreSeedVenues, saveVenue, storageMode } from './storage'

function newId() {
  return (
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  )
}

export function useVenues() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const venuesRef = useRef<Venue[]>([])
  const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<string>>(new Set())
  const recentTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    venuesRef.current = venues
  }, [venues])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listVenues()
      .then(v => {
        if (!cancelled) {
          setVenues(v)
          venuesRef.current = v
          setError(null)
        }
      })
      .catch(err => {
        if (!cancelled) setError(String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const upsert = useCallback(
    async (venue: Venue) => {
      const current = venuesRef.current
      const next = current.some(v => v.id === venue.id)
        ? current.map(v => (v.id === venue.id ? venue : v))
        : [venue, ...current]
      venuesRef.current = next
      setVenues(next)
      try {
        await saveVenue(venue, next)
      } catch (err) {
        setError(String(err))
      }
    },
    [],
  )

  const add = useCallback(
    async (draft: VenueDraft) => {
      const now = new Date().toISOString()
      const venue: Venue = {
        id: newId(),
        created_at: now,
        updated_at: now,
        ...draft,
      }
      await upsert(venue)
      setRecentlyAddedIds(prev => new Set([...prev, venue.id]))
      const timer = setTimeout(() => {
        setRecentlyAddedIds(prev => {
          const next = new Set(prev)
          next.delete(venue.id)
          return next
        })
        recentTimers.current.delete(venue.id)
      }, 20000)
      recentTimers.current.set(venue.id, timer)
      return venue
    },
    [upsert],
  )

  const update = useCallback(
    async (id: string, patch: Partial<Venue>) => {
      const existing = venuesRef.current.find(v => v.id === id)
      if (!existing) return
      const next: Venue = {
        ...existing,
        ...patch,
        id,
        updated_at: new Date().toISOString(),
      }
      await upsert(next)
    },
    [upsert],
  )

  const remove = useCallback(
    async (id: string) => {
      const next = venuesRef.current.filter(v => v.id !== id)
      venuesRef.current = next
      setVenues(next)
      try {
        await removeVenue(id, next)
      } catch (err) {
        setError(String(err))
      }
    },
    [],
  )

  const restoreSeed = useCallback(async () => {
    try {
      const restored = await restoreSeedVenues(venuesRef.current)
      venuesRef.current = restored
      setVenues(restored)
      setError(null)
    } catch (err) {
      setError(String(err))
    }
  }, [])

  const cleanupDuplicates = useCallback(async () => {
    try {
      const result = await deleteDuplicateVenues(venuesRef.current)
      venuesRef.current = result.venues
      setVenues(result.venues)
      setError(null)
      return result.removed
    } catch (err) {
      setError(String(err))
      return 0
    }
  }, [])

  const cleanupPhones = useCallback(async () => {
    try {
      const result = await clearInvalidPhones(venuesRef.current)
      venuesRef.current = result.venues
      setVenues(result.venues)
      setError(null)
      return { cleared: result.cleared, normalized: result.normalized }
    } catch (err) {
      setError(String(err))
      return { cleared: 0, normalized: 0 }
    }
  }, [])

  return { venues, loading, error, add, update, remove, restoreSeed, cleanupDuplicates, cleanupPhones, storageMode, recentlyAddedIds }
}
