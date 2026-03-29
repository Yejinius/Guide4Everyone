import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import { useAppStore } from './store';
import { Button } from './components/ui/Button';
import { MainModal } from './components/MainModal';
import { WarehouseModal } from './components/WarehouseModal';
import { ViewerModal } from './components/ViewerModal';
import { SettingsModal } from './components/SettingsModal';
import { FileText, Settings, Share2, LogOut, BookOpen } from 'lucide-react';

import { Toaster } from 'sonner';

export default function App() {
  const { user, setUser, setDriveToken, activeModal, setActiveModal } = useAppStore();
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, [setUser]);

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setDriveToken(credential.accessToken);
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setDriveToken(null);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse text-slate-400 font-medium">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-10 text-center space-y-6 border border-slate-100">
          <div className="w-20 h-20 bg-indigo-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-200">
            <BookOpen size={40} strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">모두의 설명서</h1>
          <p className="text-slate-500 leading-relaxed">
            구글 드라이브에 스캔한 설명서를 불러오고,<br/>OCR로 검색하고, 사람들과 공유하세요.
          </p>
          <Button onClick={handleLogin} className="w-full h-14 text-lg mt-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-all hover:shadow-lg">
            Google 계정으로 시작하기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Toaster />
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setActiveModal('main')}>
          <div className="w-9 h-9 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-sm group-hover:bg-indigo-700 transition-colors">
            <BookOpen size={18} strokeWidth={2} />
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-900">모두의 설명서</span>
        </div>
        
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setActiveModal('warehouse')} title="공유창고" className="text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl">
            <Share2 size={20} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setActiveModal('settings')} title="설정" className="text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl">
            <Settings size={20} />
          </Button>
          <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-200 ml-3 shadow-sm">
            <img src={user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user.displayName}`} alt="Profile" className="w-full h-full object-cover" />
          </div>
        </div>
      </header>

      {/* Main Content Area (Modals) */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {activeModal === 'main' && <MainModal />}
        {activeModal === 'warehouse' && <WarehouseModal />}
        {activeModal === 'viewer' && <ViewerModal />}
        {activeModal === 'settings' && <SettingsModal />}
      </main>
    </div>
  );
}
