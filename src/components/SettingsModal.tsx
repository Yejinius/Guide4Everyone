import { useState } from 'react';
import { useAppStore } from '../store';
import { auth } from '../firebase';
import { updateProfile, signOut } from 'firebase/auth';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { User, Mail, Coffee, LogOut, Code, Check, Settings, ChevronLeft, CreditCard, Info } from 'lucide-react';

import { toast } from 'sonner';

export function SettingsModal() {
  const { user, setUser, setDriveToken, setActiveModal } = useAppStore();
  const [nickname, setNickname] = useState(user?.displayName || '');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleUpdateNickname = async () => {
    if (!user || !nickname.trim() || nickname === user.displayName) return;
    setIsUpdating(true);
    try {
      await updateProfile(user, { displayName: nickname.trim() });
      setUser({ ...user, displayName: nickname.trim() } as any);
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (error) {
      console.error(error);
      toast.error('닉네임 변경에 실패했습니다.', {
        position: 'top-center',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setDriveToken(null);
    setActiveModal('main');
  };

  const handleDonation = () => {
    // In a real app, this would integrate with Stripe, Toss Payments, etc.
    toast.info('결제 모듈 연동 준비 중입니다. (Stripe, Toss Payments 등 연동 예정)', {
      position: 'top-center',
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 max-w-3xl mx-auto w-full p-6 md:p-10">
      <div className="flex items-center gap-4 mb-10">
        <Button variant="ghost" size="icon" onClick={() => setActiveModal('main')} className="rounded-xl hover:bg-slate-200">
          <ChevronLeft size={24} className="text-slate-600" />
        </Button>
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
          <Settings className="text-indigo-600" size={32} strokeWidth={2.5} />
          설정
        </h2>
      </div>

      <div className="space-y-8 flex-1 overflow-y-auto pb-20">
        {/* Profile Section */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
          <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <User size={24} className="text-indigo-500" />
            프로필 설정
          </h3>
          <div className="flex items-center gap-6 mb-8">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-100 border-4 border-white shadow-lg shrink-0">
              <img src={user?.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.displayName}`} alt="Profile" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-bold text-slate-500 mb-2 uppercase tracking-wider">닉네임</label>
              <div className="flex gap-3">
                <Input 
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="flex-1 bg-slate-50 border-slate-200 rounded-xl h-12 text-lg font-medium focus-visible:ring-indigo-500"
                />
                <Button 
                  onClick={handleUpdateNickname} 
                  disabled={isUpdating || nickname === user?.displayName || !nickname.trim()}
                  className={`rounded-xl h-12 px-6 font-bold shadow-sm ${isSuccess ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-indigo-600 hover:bg-indigo-700"}`}
                >
                  {isSuccess ? <Check size={18} className="mr-2" /> : null}
                  {isSuccess ? '변경됨' : '변경'}
                </Button>
              </div>
            </div>
          </div>
          <div className="pt-6 border-t border-slate-100">
            <label className="block text-sm font-bold text-slate-500 mb-2 uppercase tracking-wider">연동된 계정</label>
            <p className="text-slate-900 font-medium text-lg bg-slate-50 p-4 rounded-xl border border-slate-100">{user?.email}</p>
          </div>
        </div>

        {/* Support Section */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
          <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Coffee size={24} className="text-amber-500" />
            지원 및 후원
          </h3>
          <div className="space-y-4">
            <button 
              onClick={handleDonation}
              className="w-full flex items-center justify-between p-5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-2xl transition-colors group text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                  <Coffee size={24} className="text-amber-700" />
                </div>
                <div>
                  <h4 className="font-bold text-amber-900 text-lg">개발자에게 커피 사주기</h4>
                  <p className="text-amber-700/80 text-sm font-medium">더 나은 서비스를 위해 후원해주세요 (결제 연동 예정)</p>
                </div>
              </div>
              <CreditCard size={24} className="text-amber-400 group-hover:text-amber-600 transition-colors" />
            </button>
            
            <a href="mailto:yejinius@gmail.com" className="flex items-center justify-between p-5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl transition-colors group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:shadow transition-shadow">
                  <Mail size={24} className="text-slate-600" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-lg">문의하기</h4>
                  <p className="text-slate-500 text-sm font-medium">버그 리포트 및 기능 제안</p>
                </div>
              </div>
            </a>
          </div>
        </div>

        {/* App Info Section */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
          <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Info size={24} className="text-slate-500" />
            앱 정보
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <span className="font-bold text-slate-600">버전</span>
              <span className="text-slate-900 font-medium bg-slate-100 px-3 py-1 rounded-lg">1.0.0</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-slate-100">
              <span className="font-bold text-slate-600">개발자</span>
              <span className="text-slate-900 font-medium">Yejinius</span>
            </div>
            <div className="pt-6">
              <Button variant="outline" onClick={handleLogout} className="w-full h-14 rounded-2xl border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 font-bold text-lg flex items-center justify-center gap-2">
                <LogOut size={20} />
                로그아웃
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
