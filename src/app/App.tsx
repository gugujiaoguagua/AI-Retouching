import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/app/components/ui/sonner';
import { HomePage } from '@/app/pages/HomePage';
import { UploadPage } from '@/app/pages/UploadPage';
import { ConfirmPage } from '@/app/pages/ConfirmPage';
import { GeneratingPage } from '@/app/pages/GeneratingPage';
import { ResultPage } from '@/app/pages/ResultPage';
import { ErrorPage } from '@/app/pages/ErrorPage';
import { HistoryPage } from '@/app/pages/HistoryPage';
import { SettingsPage } from '@/app/pages/SettingsPage';
import { AdminLicensePage } from '@/app/pages/AdminLicensePage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/confirm" element={<ConfirmPage />} />
        <Route path="/generating" element={<GeneratingPage />} />
        <Route path="/result" element={<ResultPage />} />
        <Route path="/error" element={<ErrorPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin/license" element={<AdminLicensePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-center" />
    </HashRouter>
  );
}


