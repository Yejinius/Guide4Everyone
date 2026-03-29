import { useState, useEffect } from 'react';
import { useAppStore, SharedManual } from '../store';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy, addDoc, serverTimestamp, doc, updateDoc, increment, where } from 'firebase/firestore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { FileText, Download, MessageSquare, Heart, Search, User as UserIcon, BookOpen } from 'lucide-react';
import { format } from 'date-fns';

import { handleFirestoreError, OperationType } from '../utils/errorHandling';

export function WarehouseModal() {
  const { user, setActiveModal, setSelectedManual } = useAppStore();
  const [sharedManuals, setSharedManuals] = useState<SharedManual[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'shared_manuals'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SharedManual));
      setSharedManuals(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'shared_manuals');
    });
    return () => unsubscribe();
  }, []);

  const handleOpenViewer = (manual: SharedManual) => {
    setSelectedManual(manual);
    setActiveModal('viewer');
  };

  const filteredManuals = sharedManuals.filter(m => 
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    m.fileName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col bg-slate-50 max-w-7xl mx-auto w-full p-6 md:p-10">
      {/* Top Search Bar */}
      <div className="w-full mb-10">
        <h2 className="text-3xl font-bold text-slate-900 mb-6 tracking-tight">설명서 공유창고</h2>
        <div className="relative group max-w-2xl">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={22} />
          <Input 
            placeholder="공유된 설명서 검색..." 
            className="w-full h-16 pl-14 pr-6 text-lg rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-slate-200 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 transition-all bg-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Grid of Shared Manuals */}
      <div className="flex-1 overflow-y-auto pb-20">
        {filteredManuals.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-slate-400 py-20">
            <Search size={48} className="mb-4 text-slate-300" strokeWidth={1.5} />
            <p className="text-xl font-bold text-slate-500">검색 결과가 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredManuals.map(manual => (
              <div 
                key={manual.id} 
                className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden cursor-pointer hover:shadow-lg hover:border-indigo-200 transition-all group flex flex-col"
                onClick={() => handleOpenViewer(manual)}
              >
                {/* Thumbnail Area */}
                <div className="aspect-[4/3] bg-slate-100 relative flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                  <BookOpen size={64} className="text-slate-300 group-hover:text-indigo-200 transition-colors" strokeWidth={1} />
                  <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 shadow-sm">
                    {manual.createdAt?.toDate ? format(manual.createdAt.toDate(), 'yyyy.MM.dd') : ''}
                  </div>
                </div>
                
                {/* Content Area */}
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-bold text-slate-900 text-lg mb-1 truncate">{manual.title}</h3>
                  <p className="text-sm text-slate-500 mb-4 line-clamp-2 leading-relaxed flex-1">{manual.description}</p>
                  
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 shrink-0">
                        {manual.authorPhoto ? <img src={manual.authorPhoto} alt="" className="w-full h-full object-cover" /> : <UserIcon className="w-full h-full p-1.5 text-slate-500" />}
                      </div>
                      <span className="text-sm font-bold text-slate-700 truncate max-w-[100px]">{manual.authorName}</span>
                    </div>
                    
                    <div className="flex items-center gap-3 text-slate-400 text-sm font-medium">
                      <div className="flex items-center gap-1">
                        <Heart size={16} className={manual.likesCount > 0 ? "text-red-500 fill-red-500" : ""} />
                        <span>{manual.likesCount || 0}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageSquare size={16} />
                        <span>{manual.commentsCount || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
