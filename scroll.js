const svg = document.querySelector('svg.squiggle')
const path = svg?.querySelector('path')

if (svg && path) {
  const pathLength = path.getTotalLength()
  path.style.strokeDasharray = pathLength
  path.style.strokeDashoffset = pathLength

  const scroll = () => {
    const distance = window.scrollY
    const maxScroll = window.innerHeight * 0.4 // 110vh
    const percentage = Math.min(Math.max(distance / maxScroll, 0), 1)

    path.style.strokeDashoffset = pathLength * (1 - percentage)
  }

  scroll() // run on load
  window.addEventListener('scroll', scroll)
}
