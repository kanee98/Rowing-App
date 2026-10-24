import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { TourProvider } from './context/TourContext'
import { NavigationProvider } from './context/NavigationContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <TourProvider>
        <NavigationProvider><App /></NavigationProvider>
      </TourProvider>
    </AuthProvider>
  </React.StrictMode>,
)
