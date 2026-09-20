;(() => {
  'use strict'
  const slides = [...document.querySelectorAll('.slide')]
  const stage = document.querySelector('.stage')
  const previous = document.querySelector('#previous')
  const next = document.querySelector('#next')
  const overview = document.querySelector('#overview')
  const overviewButton = document.querySelector('#overview-button')
  const fullscreenButton = document.querySelector('#fullscreen')
  const overviewLinks = document.querySelector('#overview-links')
  const announcement = document.querySelector('#announcement')
  let current = 0

  const hashIndex = () => {
    const value = Number(location.hash.slice(1))
    return Number.isInteger(value) && value >= 1 && value <= slides.length ? value - 1 : 0
  }

  function showSlide(index, updateHash = true) {
    current = Math.max(0, Math.min(slides.length - 1, index))
    slides.forEach((slide, i) => {
      slide.hidden = i !== current
      slide.classList.toggle('is-active', i === current)
      if (i === current) slide.scrollTop = 0
    })
    previous.disabled = current === 0
    next.disabled = current === slides.length - 1
    document.querySelector('#slide-number').textContent = String(current + 1).padStart(2, '0')
    document.querySelector('#slide-title').textContent = slides[current].dataset.title
    document.querySelector('#progress-fill').style.transform =
      `scaleX(${(current + 1) / slides.length})`
    ;[...overviewLinks.children].forEach((button, i) => {
      if (i === current) button.setAttribute('aria-current', 'true')
      else button.removeAttribute('aria-current')
    })
    announcement.textContent = `第 ${current + 1} 頁，共 ${slides.length} 頁。${slides[current].dataset.title}`
    if (updateHash) history.replaceState(null, '', `#${current + 1}`)
  }

  function openOverview() {
    if (overview.open) return
    overview.showModal()
    overviewLinks.children[current].focus()
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      announcement.textContent = '此瀏覽器目前無法開啟全螢幕，仍可使用方向鍵瀏覽簡報。'
    }
  }

  slides.forEach((slide, i) => {
    const button = document.createElement('button')
    const number = document.createElement('span')
    number.textContent = String(i + 1).padStart(2, '0')
    button.append(number, document.createTextNode(slide.dataset.title))
    button.addEventListener('click', () => {
      overview.close()
      showSlide(i)
    })
    overviewLinks.append(button)
  })

  previous.addEventListener('click', () => showSlide(current - 1))
  next.addEventListener('click', () => showSlide(current + 1))
  overviewButton.addEventListener('click', openOverview)
  document.querySelector('#close-overview').addEventListener('click', () => overview.close())
  overview.addEventListener('click', (event) => {
    if (event.target !== overview) return
    const bounds = overview.getBoundingClientRect()
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      overview.close()
  })
  overview.addEventListener('close', () => overviewButton.focus())
  fullscreenButton.hidden = !document.fullscreenEnabled
  fullscreenButton.addEventListener('click', toggleFullscreen)
  document.addEventListener('fullscreenchange', () => {
    const label = document.fullscreenElement ? '離開全螢幕' : '全螢幕'
    fullscreenButton.setAttribute('aria-label', label)
    fullscreenButton.title = `${label}（F）`
  })
  window.addEventListener('hashchange', () => showSlide(hashIndex(), false))
  document.addEventListener('keydown', (event) => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      overview.open ||
      event.target.closest('input, textarea, select, [contenteditable]')
    )
      return
    const key = event.key.toLowerCase()
    if (
      ['arrowright', 'pagedown'].includes(key) ||
      (key === ' ' && event.target === document.body)
    ) {
      event.preventDefault()
      showSlide(current + 1)
    } else if (['arrowleft', 'pageup'].includes(key)) {
      event.preventDefault()
      showSlide(current - 1)
    } else if (key === 'home') {
      event.preventDefault()
      showSlide(0)
    } else if (key === 'end') {
      event.preventDefault()
      showSlide(slides.length - 1)
    } else if (key === 'o') {
      event.preventDefault()
      openOverview()
    } else if (key === 'f' && document.fullscreenEnabled) {
      event.preventDefault()
      toggleFullscreen()
    }
  })

  let touchStart = null
  stage.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length !== 1) {
        touchStart = null
        return
      }
      const touch = event.touches[0]
      touchStart = { x: touch.clientX, y: touch.clientY }
    },
    { passive: true },
  )
  stage.addEventListener(
    'touchend',
    (event) => {
      if (!touchStart || event.changedTouches.length !== 1) return
      const touch = event.changedTouches[0]
      const dx = touch.clientX - touchStart.x
      const dy = touch.clientY - touchStart.y
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5)
        showSlide(current + (dx < 0 ? 1 : -1))
      touchStart = null
    },
    { passive: true },
  )
  stage.addEventListener(
    'touchcancel',
    () => {
      touchStart = null
    },
    { passive: true },
  )
  new ResizeObserver(() =>
    document.documentElement.style.setProperty('--deck-scale', stage.clientWidth / 1440),
  ).observe(stage)
  showSlide(hashIndex(), false)
})()
