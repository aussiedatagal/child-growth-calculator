import { useEffect, useState } from 'react'
import './Toast.css'

export const Toast = ({ message, show, onClose, duration = 3000 }) => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (show) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
        setTimeout(() => {
          onClose?.()
        }, 300)
      }, duration)
      return () => clearTimeout(timer)
    } else {
      setVisible(false)
    }
  }, [show, duration, onClose])

  if (!show && !visible) return null

  return (
    <div className={`toast ${visible ? 'toast-visible' : ''}`}>
      {message}
    </div>
  )
}

export default Toast

