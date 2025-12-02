import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CharacterListPage from './pages/CharacterListPage'
import CharacterEditPage from './pages/CharacterEditPage'
import CameraTestPage from './pages/CameraTestPage'
import StorylineListPage from './pages/StorylineListPage'
import StorylineEditPage from './pages/StorylineEditPage'
import StorylineTimelineEditorPage from './pages/StorylineTimelineEditorPage'
import StorageConfigPage from './pages/StorageConfigPage'
import QRCodeConfigPage from './pages/QRCodeConfigPage'
import SystemSettingsPage from './pages/SystemSettingsPage'
import ExportImportPage from './pages/ExportImportPage'
import UserManagementPage from './pages/UserManagementPage'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/characters"
          element={
            <ProtectedRoute>
              <CharacterListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/characters/new"
          element={
            <ProtectedRoute>
              <CharacterEditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/characters/:id/edit"
          element={
            <ProtectedRoute>
              <CharacterEditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/camera-test"
          element={
            <ProtectedRoute>
              <CameraTestPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/storylines"
          element={
            <ProtectedRoute>
              <StorylineListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/storylines/:id/edit"
          element={
            <ProtectedRoute>
              <StorylineEditPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/storylines/new/timeline"
          element={
            <ProtectedRoute>
              <StorylineTimelineEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/storylines/:id/timeline"
          element={
            <ProtectedRoute>
              <StorylineTimelineEditorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/storage"
          element={
            <ProtectedRoute>
              <StorageConfigPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/qrcode"
          element={
            <ProtectedRoute>
              <QRCodeConfigPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/system"
          element={
            <ProtectedRoute>
              <SystemSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/export-import"
          element={
            <ProtectedRoute>
              <ExportImportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute>
              <UserManagementPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App
