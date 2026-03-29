import React, { useState, useEffect } from 'react';
import { useAppStore, Manual } from '../store';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Search, FileText, CloudDownload, Info, BookOpen, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { extractTextFromPdf } from '../services/ocrService';
import { downloadDriveFile } from '../services/driveService';

import { toast } from 'sonner';

import { handleFirestoreError, OperationType } from '../utils/errorHandling';

export function MainModal() {
  const { user, driveToken, setActiveModal, setSelectedManual, searchQuery, setSearchQuery } = useAppStore();
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [filteredManuals, setFilteredManuals] = useState<Manual[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [processingOcrId, setProcessingOcrId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'manuals'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Manual));
      setManuals(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'manuals');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredManuals([]);
      setIsDropdownOpen(false);
    } else {
      const lowerQuery = searchQuery.toLowerCase();
      const filtered = manuals.filter(m => 
        m.productName.toLowerCase().includes(lowerQuery) || 
        m.fileName.toLowerCase().includes(lowerQuery)
      );
      setFilteredManuals(filtered);
      setIsDropdownOpen(true);
    }
  }, [searchQuery, manuals]);

  const handleSelectManual = (manual: Manual) => {
    setSelectedManual(manual);
    setActiveModal('viewer');
    setSearchQuery('');
    setIsDropdownOpen(false);
  };

  const handleManualOcr = async (e: React.MouseEvent, manual: Manual) => {
    e.stopPropagation();
    if (!driveToken) {
      toast.error('구글 드라이브 연결이 필요합니다. 먼저 우측 상단의 [드라이브에서 가져오기] 버튼을 눌러 로그인해주세요.', {
        position: 'top-center',
      });
      return;
    }
    if (!manual.driveFileId) return;

    setProcessingOcrId(manual.id);
    try {
      try {
        await updateDoc(doc(db, 'manuals', manual.id), { ocrStatus: 'pending' });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, 'manuals');
      }
      
      const blob = await downloadDriveFile(manual.driveFileId, driveToken);
      const text = await extractTextFromPdf(blob);
      
      try {
        await updateDoc(doc(db, 'manuals', manual.id), {
          ocrText: text,
          ocrStatus: text.trim() ? 'completed' : 'failed'
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, 'manuals');
      }
      
      toast.success('OCR 처리가 완료되었습니다.', {
        position: 'top-center',
      });
    } catch (error) {
      console.error('Manual OCR failed:', error);
      try {
        await updateDoc(doc(db, 'manuals', manual.id), { ocrStatus: 'failed' });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, 'manuals');
      }
      toast.error('OCR 처리에 실패했습니다. 파일이 손상되었거나 텍스트를 추출할 수 없습니다.', {
        position: 'top-center',
      });
    } finally {
      setProcessingOcrId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center p-6 md:p-10 max-w-4xl mx-auto w-full">
      {/* Notices */}
      <div className="w-full bg-indigo-50 border border-indigo-100/50 rounded-2xl p-5 mb-10 flex items-start gap-4 shadow-sm">
        <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600 shrink-0 mt-0.5">
          <Info size={20} strokeWidth={2.5} />
        </div>
        <div>
          <h3 className="font-bold text-indigo-900 text-lg">공지사항</h3>
          <p className="text-indigo-700/80 mt-1 font-medium">
            환영합니다! 우측 상단의 <span className="font-bold bg-indigo-100 px-1.5 py-0.5 rounded text-indigo-800">드라이브에서 가져오기</span> 버튼을 눌러 스캔한 설명서를 불러오고, OCR로 텍스트를 검색해보세요.
          </p>
        </div>
      </div>

      {/* Search Field */}
      <div className="w-full relative mb-14 z-20">
        <div className="relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={22} />
          <Input 
            type="text"
            placeholder="제품명이나 모델명을 검색하세요..."
            className="w-full h-16 pl-14 pr-6 text-lg rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-slate-200 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 transition-all bg-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.trim() !== '' && setIsDropdownOpen(true)}
            onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
          />
        </div>

        {/* Autocomplete Dropdown */}
        {isDropdownOpen && filteredManuals.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50">
            {filteredManuals.map(manual => (
              <div 
                key={manual.id}
                className="px-5 py-4 hover:bg-slate-50 cursor-pointer flex items-center gap-4 border-b border-slate-50 last:border-0 transition-colors"
                onClick={() => handleSelectManual(manual)}
              >
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 shrink-0">
                  <BookOpen size={18} />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-lg">{manual.productName}</div>
                  <div className="text-sm text-slate-500">{manual.fileName}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Saved Manuals List */}
      <div className="w-full flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">내 설명서 보관함</h2>
          <Button variant="outline" size="sm" onClick={() => setActiveModal('viewer')} className="gap-2 rounded-xl border-slate-200 hover:bg-slate-100 hover:text-slate-900 font-semibold h-10 px-4">
            <CloudDownload size={18} />
            드라이브에서 가져오기
          </Button>
        </div>

        {manuals.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl p-16 bg-white/50">
            <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mb-6">
              <BookOpen size={40} className="text-slate-300" strokeWidth={1.5} />
            </div>
            <p className="text-xl font-bold text-slate-500">저장된 설명서가 없습니다</p>
            <p className="text-slate-400 mt-2 text-center leading-relaxed">우측 상단의 버튼을 눌러<br/>구글 드라이브에서 설명서를 가져오세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 overflow-y-auto pb-20">
            {manuals.map(manual => {
              const isOcrCompleted = manual.ocrStatus === 'completed' || (!manual.ocrStatus && manual.ocrText);
              const isOcrPending = manual.ocrStatus === 'pending' || processingOcrId === manual.id;
              const isOcrFailed = manual.ocrStatus === 'failed' || (!manual.ocrStatus && !manual.ocrText);

              return (
                <div 
                  key={manual.id} 
                  className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer flex flex-col group relative"
                  onClick={() => handleSelectManual(manual)}
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <BookOpen size={24} strokeWidth={1.5} />
                    </div>
                    
                    {/* OCR Status Badge */}
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
                        {manual.createdAt?.toDate ? format(manual.createdAt.toDate(), 'yyyy.MM.dd') : ''}
                      </span>
                      {isOcrCompleted && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                          <CheckCircle size={12} /> 검색 가능
                        </span>
                      )}
                      {isOcrPending && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100">
                          <Loader2 size={12} className="animate-spin" /> OCR 처리 중...
                        </span>
                      )}
                      {isOcrFailed && !isOcrPending && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={(e) => handleManualOcr(e, manual)}
                          className="flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-1 h-auto rounded-md border border-rose-100"
                        >
                          <RefreshCw size={12} /> OCR 재시도
                        </Button>
                      )}
                    </div>
                  </div>
                  <h3 className="font-bold text-slate-900 text-xl mb-1.5 truncate">{manual.productName}</h3>
                  <p className="text-sm text-slate-500 truncate">{manual.fileName}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
