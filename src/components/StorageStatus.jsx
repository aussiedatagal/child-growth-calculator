import { useState, useEffect } from 'react'
import {
  initializeStorage,
  signInToGoogleDrive,
  signOutFromGoogleDrive,
  isGoogleDriveSignedIn,
  isGoogleDriveAvailable,
  getStorageMode
} from '../services/storage'
import './StorageStatus.css'

function StorageStatus() {
  const [storageMode, setStorageMode] = useState('localStorage')
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [isAvailable, setIsAvailable] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [isSigningIn, setIsSigningIn] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        await initializeStorage()
        setIsAvailable(isGoogleDriveAvailable())
        setIsSignedIn(isGoogleDriveSignedIn())
        setStorageMode(getStorageMode())
      } catch (error) {
        console.error('Error initializing storage:', error)
      } finally {
        setIsInitializing(false)
      }
    }
    init()
  }, [])

  const handleSignIn = async () => {
    setIsSigningIn(true)
    try {
      const success = await signInToGoogleDrive()
      if (success) {
        setIsSignedIn(true)
        setStorageMode('googleDrive')
        // Reload data from Google Drive
        window.location.reload()
      } else {
        alert('Failed to sign in to Google Drive. Please try again.')
      }
    } catch (error) {
      console.error('Sign in error:', error)
      alert('Error signing in: ' + error.message)
    } finally {
      setIsSigningIn(false)
    }
  }

  const handleSignOut = () => {
    if (confirm('Sign out from Google Drive? Your data will continue to be saved locally.')) {
      signOutFromGoogleDrive()
      setIsSignedIn(false)
      setStorageMode('localStorage')
    }
  }

  if (isInitializing) {
    return null
  }

  if (!isAvailable) {
    return (
      <div className="storage-status">
        <div className="storage-info">
          <span className="storage-icon">💾</span>
          <span>Using local storage</span>
        </div>
        <div className="storage-note">
          Google Drive sync not configured
        </div>
      </div>
    )
  }

  return (
    <div className="storage-status">
      {isSignedIn ? (
        <>
          <div className="storage-info">
            <span className="storage-icon">☁️</span>
            <span>Syncing with Google Drive</span>
          </div>
          <button 
            className="storage-button sign-out"
            onClick={handleSignOut}
            title="Sign out from Google Drive"
          >
            Sign Out
          </button>
        </>
      ) : (
        <>
          <div className="storage-info">
            <span className="storage-icon">💾</span>
            <span>Using local storage</span>
          </div>
          <button 
            className="storage-button sign-in"
            onClick={handleSignIn}
            disabled={isSigningIn}
            title="Sign in to sync with Google Drive"
          >
            {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </>
      )}
    </div>
  )
}

export default StorageStatus



