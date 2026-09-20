'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Mic,
  MicOff,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import type { ConversationEvent } from '@lookline/engine/conversation'
import { useI18n } from '@/i18n/client'
import { Button } from '@/components/ui'
import type { TalkImage, TalkPhase } from '@/lib/shop-talk-live'
import styles from './talk.module.css'

export function TalkChat({
  events,
  phase,
  microphone,
  speaker,
  speaking,
  full,
  available,
  signedIn,
  error,
  onSend,
  onVoice,
  onMicrophone,
  onSpeaker,
  onEnd,
  onRestart,
  onReconnect,
}: {
  events: readonly ConversationEvent[]
  phase: TalkPhase
  microphone: boolean
  speaker: boolean
  speaking: boolean
  full: boolean
  available: boolean
  signedIn: boolean
  error: string | null
  onSend: (text: string, image?: TalkImage) => Promise<boolean>
  onVoice: () => void
  onMicrophone: () => void
  onSpeaker: () => void
  onEnd: () => void
  onRestart: () => void
  onReconnect: () => void
}) {
  const { t } = useI18n()
  const copy = t.shopTalk
  const [draft, setDraft] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState(false)
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [newMessages, setNewMessages] = useState(false)
  const transcript = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const follow = useRef(true)
  const composing = useRef(false)
  const disabled = !signedIn || !available || full || sending
  const connected = phase === 'connected' || phase === 'connecting'
  const status = speaking ? copy.speaking : microphone ? copy.listening : copy[phase]
  useEffect(() => {
    const element = transcript.current
    if (!element) return
    if (follow.current) {
      element.scrollTop = element.scrollHeight
      setNewMessages(false)
    } else setNewMessages(true)
  }, [events, expanded])
  async function send(event?: FormEvent) {
    event?.preventDefault()
    const text = draft.trim()
    if ((!text && !photo) || disabled || composing.current) return
    setSending(true)
    follow.current = true
    setExpanded(true)
    try {
      const image = photo
        ? { data: photo.slice(photo.indexOf(',') + 1), mimeType: 'image/jpeg' }
        : undefined
      if (await onSend(text || copy.photo, image)) {
        setDraft('')
        setPhoto(null)
      }
    } finally {
      setSending(false)
    }
  }
  async function attach(file?: File) {
    if (!file) return
    try {
      setPhoto(await encodePhoto(file))
      setPhotoError(false)
    } catch {
      setPhotoError(true)
    }
  }
  return (
    <section className={styles.chat} data-expanded={expanded} aria-label={copy.chat}>
      <header className={styles.chatHeader}>
        <div>
          <h2 className={styles.chatTitle}>{copy.chat}</h2>
          <span className={styles.status} role="status" data-listening={microphone}>
            {status}
          </span>
        </div>
        <div className={styles.actions}>
          {connected ? (
            <button className={styles.icon} onClick={onEnd} aria-label={copy.end} title={copy.end}>
              <Square />
            </button>
          ) : null}
          <button
            className={styles.icon}
            onClick={() => {
              setDraft('')
              setPhoto(null)
              onRestart()
            }}
            aria-label={copy.restart}
            title={copy.restart}
            disabled={!events.length && !connected}
          >
            <RotateCcw />
          </button>
          <button
            className={`${styles.icon} ${styles.expand}`}
            aria-expanded={expanded}
            aria-controls="talk-transcript"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? copy.collapse : copy.expand}
          >
            {expanded ? <ChevronDown /> : <ChevronUp />}
          </button>
        </div>
      </header>
      <div
        ref={transcript}
        id="talk-transcript"
        className={styles.transcript}
        role="log"
        aria-label={copy.chat}
        aria-live="off"
        onScroll={(event) => {
          const el = event.currentTarget
          follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
          if (follow.current) setNewMessages(false)
        }}
      >
        {!events.length ? (
          <div className={styles.welcome}>
            <h3>{copy.welcome}</h3>
            <p>{copy.introduction}</p>
          </div>
        ) : null}
        <ol className={styles.messages}>
          {events.map((event) => {
            if (event.kind === 'filters')
              return (
                <li key={event.id} className={styles.manual}>
                  {copy.changedFilters}
                </li>
              )
            if (!event.text) return null
            return (
              <li key={event.id} className={styles.message} data-role={event.role}>
                <span className={styles.role}>
                  {event.role === 'user' ? copy.you : copy.assistant}
                </span>
                <p>{event.text}</p>
                {event.status === 'interrupted' ? <small>{copy.interrupted}</small> : null}
              </li>
            )
          })}
        </ol>
      </div>
      {newMessages ? (
        <button
          className={styles.newMessages}
          onClick={() => {
            follow.current = true
            setNewMessages(false)
            const el = transcript.current
            if (el) el.scrollTop = el.scrollHeight
          }}
        >
          {copy.newMessages}
        </button>
      ) : null}
      <div className={styles.feedback}>
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        {photoError ? (
          <p role="alert" className={styles.error}>
            {copy.photoError}
          </p>
        ) : null}
        {phase === 'disconnected' ? (
          <Button size="sm" variant="secondary" onClick={onReconnect}>
            {copy.reconnect}
          </Button>
        ) : null}
        {!signedIn ? (
          <Link href="/login?next=%2Fshop-talk" className="py-3 text-sm underline">
            {copy.signIn}
          </Link>
        ) : !available ? (
          <p className={styles.error}>{copy.unavailable}</p>
        ) : null}
      </div>
      <form className={styles.composer} onSubmit={send}>
        {photo ? (
          <div className={styles.attachment}>
            <img src={photo} alt="" />
            <button
              type="button"
              className={styles.icon}
              onClick={() => setPhoto(null)}
              aria-label={copy.removePhoto}
              title={copy.removePhoto}
            >
              <X />
            </button>
          </div>
        ) : null}
        <div className={styles.inputRow}>
          <textarea
            className={styles.input}
            rows={2}
            aria-label={copy.placeholder}
            placeholder={copy.placeholder}
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onCompositionStart={() => {
              composing.current = true
            }}
            onCompositionEnd={() => {
              composing.current = false
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                !composing.current
              ) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <input
            ref={picker}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              void attach(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <button
            type="button"
            className={styles.icon}
            onClick={() => picker.current?.click()}
            disabled={disabled}
            aria-label={copy.attachPhoto}
            title={copy.attachPhoto}
          >
            <ImagePlus />
          </button>
          <button
            type="submit"
            className={styles.icon}
            disabled={disabled || (!draft.trim() && !photo)}
            aria-label={copy.send}
            title={copy.send}
          >
            <ArrowUp />
          </button>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.voice}
            onClick={connected ? onMicrophone : onVoice}
            disabled={disabled || phase === 'connecting'}
            aria-pressed={microphone}
            aria-label={connected ? (microphone ? copy.micOn : copy.micOff) : copy.startVoice}
          >
            {microphone ? <Mic /> : <MicOff />}
            <span className={styles.voiceLabel}>
              {connected ? (microphone ? copy.micOn : copy.micOff) : copy.startVoice}
            </span>
          </button>
          <button
            type="button"
            className={styles.icon}
            onClick={onSpeaker}
            disabled={!available || !signedIn || full}
            aria-pressed={speaker}
            aria-label={speaker ? copy.soundOn : copy.soundOff}
            title={speaker ? copy.soundOn : copy.soundOff}
          >
            {speaker ? <Volume2 /> : <VolumeX />}
          </button>
        </div>
      </form>
    </section>
  )
}

/** Photos are downscaled in the browser so one turn stays well under a megabyte. */
async function encodePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}
