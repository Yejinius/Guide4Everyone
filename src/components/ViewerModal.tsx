import { useState, useEffect, useRef, useMemo } from 'react';
import { useAppStore, Manual, SharedManual } from '../store';
import { auth, db, storage, googleProvider } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, updateDoc, doc, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { fetchDriveFolders, fetchFilesInFolder, downloadDriveFile } from '../services/driveService';
import { extractTextFromPdf } from '../services/ocrService';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Search, ChevronLeft, ChevronRight, Save, FileText, CloudDownload, Loader2, Share2, Folder, BookOpen, MessageSquare, Heart, User as UserIcon, Send, CheckCircle } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { handleFirestoreError, OperationType } from '../utils/errorHandling';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function ViewerModal() {
  const { user, driveToken, setDriveToken, selectedManual, setActiveModal, setSelectedManual } = useAppStore();
  
  // Drive State
  const [driveStep, setDriveStep] = useState<'auth' | 'folders' | 'files' | 'viewer'>('auth');
  const [folders, setFolders] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>('');
  const [currentFileId, setCurrentFileId] = useState<string>('');
  
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Selection State
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggered = useRef(false);
  
  useEffect(() => {
    if (selectionMode && selectedItems.size === 0) {
      setSelectionMode(false);
    }
  }, [selectionMode, selectedItems.size]);
  const [pdfFile, setPdfFile] = useState<File | string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{page: number, text: string}[]>([]);
  const [ocrText, setOcrText] = useState('');
  const [productName, setProductName] = useState('');

  // Shared Manual State
  const isSharedManual = selectedManual && 'authorName' in selectedManual;
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    return () => {
      if (pdfFile && typeof pdfFile === 'string' && pdfFile.startsWith('blob:')) {
        URL.revokeObjectURL(pdfFile);
      }
    };
  }, [pdfFile]);

  const pdfOptions = useMemo(() => ({
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`
  }), []);

  useEffect(() => {
    if (selectedManual) {
      setProductName('productName' in selectedManual ? selectedManual.productName : selectedManual.title);
      setOcrText('ocrText' in selectedManual ? selectedManual.ocrText : '');
      setPageNumber(1);
      
      if (isSharedManual) {
        setDriveStep('viewer');
        // Fetch shared manual from Storage URL
        loadPdfFromUrl((selectedManual as SharedManual).downloadUrl);
      } else if ('driveFileId' in selectedManual && selectedManual.driveFileId) {
        if (driveToken) {
          setDriveStep('viewer');
          loadPdfFromDrive(selectedManual.driveFileId);
        } else {
          // Need to re-authenticate to view Drive file
          setDriveStep('auth');
          setPdfFile(null); // Ensure viewer doesn't show blank space
        }
      }
    } else {
      if (driveToken) {
        setDriveStep('folders');
        loadFolders(driveToken);
      } else {
        setDriveStep('auth');
      }
    }
  }, [selectedManual, driveToken]);

  // Load comments if it's a shared manual
  useEffect(() => {
    if (!isSharedManual || !selectedManual) return;
    const q = query(
      collection(db, 'comments'),
      where('sharedManualId', '==', selectedManual.id),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setComments(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'comments');
    });
    return () => unsubscribe();
  }, [selectedManual, isSharedManual]);

  const handleConnectDrive = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setDriveToken(credential.accessToken);
        setDriveStep('folders');
        loadFolders(credential.accessToken);
      }
    } catch (error) {
      console.error('Drive connection error:', error);
      toast.error('구글 드라이브 연결에 실패했습니다.', {
        position: 'top-center',
      });
    }
  };

  const loadFolders = async (token: string) => {
    setIsLoadingDrive(true);
    try {
      const fetchedFolders = await fetchDriveFolders(token);
      setFolders(fetchedFolders);
    } catch (error) {
      console.error(error);
      setDriveToken(null); // Token might be expired
      setDriveStep('auth');
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleSelectFolder = async (folderId: string) => {
    setCurrentFolderId(folderId);
    setDriveStep('files');
    setIsLoadingDrive(true);
    setSelectionMode(false);
    setSelectedItems(new Set());
    try {
      const fetchedFiles = await fetchFilesInFolder(folderId, driveToken!);
      setFiles(fetchedFiles);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handlePointerDown = (id: string) => {
    longPressTriggered.current = false;
    pressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setSelectionMode(true);
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        newSet.add(id);
        return newSet;
      });
    }, 1000);
  };

  const handlePointerUp = (id: string, file: any) => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }

    if (selectionMode) {
      setSelectedItems(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        return newSet;
      });
    } else {
      setProductName(file.name.replace('.pdf', '').trim());
      setCurrentFileId(id);
      loadPdfFromDrive(id);
    }
  };

  const handlePointerLeave = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const processBackgroundOCR = async (docId: string, driveFileId: string, token: string, fileName: string) => {
    try {
      const blob = await downloadDriveFile(driveFileId, token);
      const text = await extractTextFromPdf(blob);
      
      try {
        await updateDoc(doc(db, 'manuals', docId), {
          ocrText: text,
          ocrStatus: text.trim() ? 'completed' : 'failed'
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, 'manuals');
      }
      
      toast.success(`파일 '${fileName}'의 OCR이 준비되었습니다.`, {
        duration: 5000,
        position: 'top-center',
      });
    } catch (error) {
      console.error(`Background OCR failed for ${docId}:`, error);
      try {
        await updateDoc(doc(db, 'manuals', docId), {
          ocrStatus: 'failed'
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, 'manuals');
      }
      toast.error(`파일 '${fileName}'의 OCR 처리에 실패했습니다.`, {
        duration: 5000,
        position: 'top-center',
      });
    }
  };

  const handleImportFiles = async () => {
    if (!user || !driveToken) return;
    
    const filesToImport = (selectionMode && selectedItems.size > 0 
      ? files.filter(f => selectedItems.has(f.id))
      : files).filter(f => f.id);

    if (filesToImport.length === 0) {
      toast.error('가져올 수 있는 파일이 없습니다.', { position: 'top-center' });
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
    try {
      const importPromises = filesToImport.map(async (file) => {
        const yyMMddHH = format(new Date(), 'yyMMddHH');
        const baseName = (file.name || '').replace('.pdf', '').trim();
        const productName = (baseName || '설명서').substring(0, 250);
        const newFileName = `${productName}_${yyMMddHH}.pdf`;
        
        const newManual = {
          ownerId: user.uid,
          fileName: newFileName,
          productName: productName,
          driveFileId: file.id,
          ocrText: '',
          ocrStatus: 'pending',
          createdAt: serverTimestamp()
        };
        
        let docRef;
        try {
          docRef = await addDoc(collection(db, 'manuals'), newManual);
        } catch (e) {
          handleFirestoreError(e, OperationType.CREATE, 'manuals');
          throw e; // rethrow to be caught by outer catch
        }
        
        // Trigger background OCR asynchronously without awaiting
        processBackgroundOCR(docRef.id, file.id, driveToken, baseName);
        
        return docRef.id;
      });

      await Promise.all(importPromises);
      
      toast.info(`${filesToImport.length}개의 파일을 가져왔습니다. 백그라운드에서 OCR 처리가 진행됩니다. 다른 화면으로 이동하셔도 됩니다.`, {
        duration: 5000,
        position: 'top-center',
      });
      setActiveModal('main');
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(`파일 가져오기 중 오류가 발생했습니다: ${error?.message || '알 수 없는 오류'}`, {
        position: 'top-center',
      });
    } finally {
      setIsProcessing(false);
      setSelectionMode(false);
      setSelectedItems(new Set());
    }
  };

  const loadPdfFromDrive = async (fileId: string) => {
    setIsProcessing(true);
    try {
      const blob = await downloadDriveFile(fileId, driveToken!);
      const url = URL.createObjectURL(blob);
      setPdfFile(url);
      setPageNumber(1);
      
      if (!selectedManual) {
        // Extract OCR if it's a new import
        const text = await extractTextFromPdf(blob);
        setOcrText(text);
      }
    } catch (error) {
      console.error(error);
      toast.error('PDF 파일을 불러오는데 실패했습니다.', {
        position: 'top-center',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const loadPdfFromUrl = async (url: string) => {
    setIsProcessing(true);
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      setPdfFile(URL.createObjectURL(blob));
      setPageNumber(1);
    } catch (error) {
      console.error(error);
      toast.error('공유된 PDF 파일을 불러오는데 실패했습니다.', {
        position: 'top-center',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!user || !pdfFile || !productName.trim()) return;
    
    setIsProcessing(true);
    try {
      const yyMMddHH = format(new Date(), 'yyMMddHH');
      const safeProductName = productName.trim().substring(0, 250);
      const newFileName = `${safeProductName}_${yyMMddHH}.pdf`;
      
      const newManual: any = {
        ownerId: user.uid,
        fileName: newFileName,
        productName: safeProductName,
        ocrText: ocrText,
        ocrStatus: ocrText.trim() ? 'completed' : 'failed',
        createdAt: serverTimestamp()
      };
      
      if (currentFileId) {
        newManual.driveFileId = currentFileId;
      }
      
      let docRef;
      try {
        docRef = await addDoc(collection(db, 'manuals'), newManual);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'manuals');
        throw e;
      }
      setSelectedManual({ id: docRef.id, ...newManual } as Manual);
      toast.success('설명서가 성공적으로 저장되었습니다.', {
        position: 'top-center',
      });
    } catch (error) {
      console.error(error);
      toast.error('저장 중 오류가 발생했습니다.', {
        position: 'top-center',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleShare = async () => {
    if (!user || !selectedManual || !pdfFile) return;
    
    setIsProcessing(true);
    try {
      // 1. Fetch Blob from current object URL
      const response = await fetch(pdfFile as string);
      const blob = await response.blob();
      
      // 2. Upload to Firebase Storage
      const storageRef = ref(storage, `shared_manuals/${Date.now()}_${selectedManual.fileName}`);
      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);
      
      // 3. Save metadata to Firestore
      const newSharedManual = {
        authorId: user.uid,
        authorName: (user.displayName || '익명').substring(0, 100),
        authorPhoto: user.photoURL || '',
        title: ('productName' in selectedManual ? selectedManual.productName : selectedManual.title).substring(0, 250),
        description: '공유된 설명서입니다.',
        fileName: selectedManual.fileName.substring(0, 300),
        downloadUrl: downloadUrl,
        likesCount: 0,
        commentsCount: 0,
        createdAt: serverTimestamp()
      };
      
      try {
        await addDoc(collection(db, 'shared_manuals'), newSharedManual);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'shared_manuals');
        throw e;
      }
      toast.success('설명서가 공유창고에 등록되었습니다.', {
        position: 'top-center',
      });
      setActiveModal('warehouse');
    } catch (error) {
      console.error(error);
      toast.error('공유 중 오류가 발생했습니다.', {
        position: 'top-center',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSearch = () => {
    if (!searchQuery.trim() || !ocrText) {
      setSearchResults([]);
      return;
    }
    
    const results: {page: number, text: string}[] = [];
    const pages = ocrText.split('\n\n');
    
    pages.forEach((pageText, index) => {
      if (pageText.toLowerCase().includes(searchQuery.toLowerCase())) {
        const matchIndex = pageText.toLowerCase().indexOf(searchQuery.toLowerCase());
        const start = Math.max(0, matchIndex - 40);
        const end = Math.min(pageText.length, matchIndex + searchQuery.length + 40);
        let snippet = pageText.substring(start, end).replace(/\n/g, ' ');
        if (start > 0) snippet = '...' + snippet;
        if (end < pageText.length) snippet = snippet + '...';
        
        results.push({ page: index + 1, text: snippet });
      }
    });
    
    setSearchResults(results);
  };

  const handleAddComment = async () => {
    if (!user || !selectedManual || !newComment.trim()) return;
    
    try {
      const commentData: any = {
        sharedManualId: selectedManual.id,
        authorId: user.uid,
        authorName: user.displayName || '익명',
        authorPhoto: user.photoURL || '',
        content: newComment.trim(),
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, 'comments'), commentData);

      await updateDoc(doc(db, 'shared_manuals', selectedManual.id), {
        commentsCount: increment(1)
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'comments');
    }

    setNewComment('');
  };

  const handleLike = async () => {
    if (!user || !selectedManual) return;
    const manualRef = doc(db, 'shared_manuals', selectedManual.id);
    try {
      await updateDoc(manualRef, { likesCount: increment(1) });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'shared_manuals');
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  // Render Drive File Selection if no manual is selected and no PDF is loaded
  if ((!selectedManual && !pdfFile) || (selectedManual && !isSharedManual && !driveToken)) {
    return (
      <div className="h-full flex flex-col p-6 md:p-10 max-w-5xl mx-auto w-full bg-white rounded-3xl shadow-sm border border-slate-200 my-6">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-bold text-slate-900 flex items-center gap-3 tracking-tight">
            <CloudDownload className="text-indigo-600" size={32} strokeWidth={2.5} />
            {selectedManual ? '구글 드라이브 연결 필요' : '구글 드라이브에서 가져오기'}
          </h2>
          <Button variant="ghost" onClick={() => setActiveModal('main')} className="rounded-xl font-semibold">취소</Button>
        </div>
        
        {driveStep === 'auth' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
            <div className="w-24 h-24 bg-indigo-50 rounded-3xl flex items-center justify-center mb-8 shadow-sm">
              <CloudDownload size={48} className="text-indigo-600" strokeWidth={1.5} />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-4">구글 드라이브 연결</h3>
            <p className="text-slate-500 mb-10 max-w-md leading-relaxed text-lg">
              {selectedManual ? (
                <>저장된 설명서 PDF 파일을 불러오기 위해<br/>구글 드라이브 접근 권한이 필요합니다.</>
              ) : (
                <>스캔한 설명서 PDF 파일을 불러오기 위해<br/>구글 드라이브 접근 권한이 필요합니다.</>
              )}
            </p>
            <Button onClick={handleConnectDrive} className="h-14 px-8 text-lg rounded-2xl bg-indigo-600 hover:bg-indigo-700 shadow-md">
              Google Drive 연결하기
            </Button>
          </div>
        )}

        {driveStep === 'folders' && (
          <div className="flex-1 flex flex-col">
            <h3 className="text-xl font-bold text-slate-700 mb-6 flex items-center gap-2">
              <Folder size={24} className="text-slate-400" />
              폴더 선택
            </h3>
            {isLoadingDrive ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="animate-spin text-indigo-500" size={48} />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5 overflow-y-auto pb-10">
                {folders.map(folder => (
                  <div 
                    key={folder.id}
                    className="p-6 border border-slate-200 rounded-3xl hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md cursor-pointer transition-all flex flex-col items-center text-center group"
                    onClick={() => handleSelectFolder(folder.id)}
                  >
                    <Folder size={48} className="text-slate-300 group-hover:text-indigo-500 mb-4 transition-colors" strokeWidth={1.5} />
                    <p className="font-bold text-slate-900 line-clamp-2 text-sm">{folder.name}</p>
                  </div>
                ))}
                {folders.length === 0 && (
                  <div className="col-span-full text-center py-20 text-slate-500 font-medium text-lg">
                    드라이브에 폴더가 없습니다.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {driveStep === 'files' && (
          <div className="flex-1 flex flex-col relative">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={() => {
                  if (selectionMode) {
                    setSelectionMode(false);
                    setSelectedItems(new Set());
                  } else {
                    setDriveStep('folders');
                  }
                }} className="rounded-xl">
                  <ChevronLeft size={20} />
                </Button>
                <h3 className="text-xl font-bold text-slate-700 flex items-center gap-2">
                  <FileText size={24} className="text-slate-400" />
                  {selectionMode ? `${selectedItems.size}개 선택됨` : 'PDF 파일 선택'}
                </h3>
              </div>
              {selectionMode && (
                <Button variant="ghost" onClick={() => {
                  if (selectedItems.size === files.length) {
                    setSelectedItems(new Set());
                    setSelectionMode(false);
                  } else {
                    setSelectedItems(new Set(files.map(f => f.id)));
                  }
                }} className="text-indigo-600 font-semibold">
                  {selectedItems.size === files.length ? '전체 해제' : '전체 선택'}
                </Button>
              )}
            </div>
            {isLoadingDrive ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="animate-spin text-indigo-500" size={48} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5 overflow-y-auto pb-24">
                  {files.map(file => {
                    const isSelected = selectedItems.has(file.id);
                    return (
                      <div 
                        key={file.id}
                        className={`p-6 border rounded-3xl cursor-pointer transition-all flex flex-col items-center text-center group relative select-none ${
                          isSelected 
                            ? 'border-indigo-500 bg-indigo-50 shadow-md' 
                            : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                        }`}
                        onPointerDown={() => handlePointerDown(file.id)}
                        onPointerUp={() => handlePointerUp(file.id, file)}
                        onPointerLeave={handlePointerLeave}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        {selectionMode && (
                          <div className={`absolute top-4 right-4 rounded-full w-6 h-6 flex items-center justify-center border-2 transition-colors ${
                            isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <CheckCircle size={16} className="text-white" strokeWidth={3} />}
                          </div>
                        )}
                        <FileText size={48} className={`${isSelected ? 'text-indigo-500' : 'text-red-400 group-hover:text-red-500'} mb-4 transition-colors`} strokeWidth={1.5} />
                        <p className="font-bold text-slate-900 line-clamp-2 text-sm mb-2">{file.name}</p>
                        <p className="text-xs font-medium text-slate-400 bg-white/60 px-2 py-1 rounded-lg">
                          {format(new Date(file.createdTime), 'yyyy.MM.dd')}
                        </p>
                      </div>
                    );
                  })}
                  {files.length === 0 && (
                    <div className="col-span-full text-center py-20 text-slate-500 font-medium text-lg">
                      이 폴더에 PDF 파일이 없습니다.
                    </div>
                  )}
                </div>
                
                {/* Bottom Action Bar */}
                {files.length > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 flex justify-center shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
                    <Button 
                      onClick={handleImportFiles} 
                      disabled={isProcessing || (selectionMode && selectedItems.size === 0)}
                      className="w-full max-w-md h-14 text-lg rounded-2xl bg-indigo-600 hover:bg-indigo-700 shadow-md flex items-center justify-center gap-2"
                    >
                      {isProcessing ? (
                        <><Loader2 size={24} className="animate-spin" /> 가져오는 중...</>
                      ) : (
                        <>
                          <CloudDownload size={24} />
                          {selectionMode && selectedItems.size > 0 
                            ? `선택 파일만 가져오기 (${selectedItems.size})` 
                            : '이 폴더의 문서들 가져오기'}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col md:flex-row bg-slate-100">
      {/* Left Panel: PDF Viewer */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setPdfFile(null); setSelectedManual(null); setActiveModal(isSharedManual ? 'warehouse' : 'main'); }} className="rounded-xl hover:bg-slate-100">
              <ChevronLeft size={24} className="text-slate-600" />
            </Button>
            <span className="font-bold text-slate-900 text-lg truncate max-w-[200px] md:max-w-md">
              {productName || '설명서 뷰어'}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-100 rounded-xl p-1">
              <Button variant="ghost" size="sm" onClick={() => setPageNumber(Math.max(1, pageNumber - 1))} disabled={pageNumber <= 1} className="h-8 w-8 p-0 rounded-lg">
                <ChevronLeft size={18} />
              </Button>
              <span className="text-sm font-bold text-slate-700 min-w-[60px] text-center">
                {pageNumber} / {numPages || '-'}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setPageNumber(Math.min(numPages || 1, pageNumber + 1))} disabled={pageNumber >= (numPages || 1)} className="h-8 w-8 p-0 rounded-lg">
                <ChevronRight size={18} />
              </Button>
            </div>
            
            {!selectedManual && (
              <Button size="sm" onClick={handleSave} disabled={isProcessing} className="ml-2 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-10 px-4 font-semibold shadow-sm">
                {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                내 설명서로 저장
              </Button>
            )}
            {selectedManual && !isSharedManual && (
              <Button size="sm" onClick={handleShare} disabled={isProcessing} className="ml-2 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 px-4 font-semibold shadow-sm">
                {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} />}
                공유창고에 올리기
              </Button>
            )}
            {isSharedManual && (
              <Button size="sm" onClick={handleLike} className="ml-2 gap-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl h-10 px-4 font-bold border border-rose-200">
                <Heart size={18} className="fill-rose-600" />
                {(selectedManual as SharedManual).likesCount || 0}
              </Button>
            )}
          </div>
        </div>
        
        <div className="flex-1 overflow-auto bg-slate-200/50 flex justify-center p-6 relative">
          {isProcessing && !pdfFile && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md z-50">
              <Loader2 className="animate-spin text-indigo-600 mb-6" size={56} strokeWidth={2} />
              <p className="text-slate-700 font-bold text-lg">PDF를 불러오고 OCR을 분석중입니다...</p>
            </div>
          )}
          
          {pdfFile && (
            <Document
              file={pdfFile}
              onLoadSuccess={onDocumentLoadSuccess}
              options={pdfOptions}
              className="shadow-2xl rounded-xl overflow-hidden border border-slate-200"
              loading={<Loader2 className="animate-spin text-indigo-400 my-32" size={56} />}
            >
              <Page 
                pageNumber={pageNumber} 
                width={Math.min(window.innerWidth - 350, 800)}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </Document>
          )}
        </div>
      </div>

      {/* Right Panel: Search & OCR Results OR Comments */}
      <div className="w-full md:w-96 bg-white border-l border-slate-200 flex flex-col h-full shrink-0 shadow-[-8px_0_30px_rgba(0,0,0,0.03)] z-20">
        {isSharedManual ? (
          // Comments Panel for Shared Manuals
          <div className="flex flex-col h-full">
            <div className="p-6 border-b border-slate-100 bg-white">
              <h3 className="font-bold text-slate-900 text-xl flex items-center gap-2">
                <MessageSquare size={22} className="text-indigo-500" />
                댓글 소통
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
              {comments.map(comment => (
                <div key={comment.id} className="flex gap-4">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-white border border-slate-200 shrink-0 shadow-sm">
                    {comment.authorPhoto ? <img src={comment.authorPhoto} alt="" className="w-full h-full object-cover" /> : <UserIcon className="w-full h-full p-2 text-slate-400" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="font-bold text-slate-900">{comment.authorName}</span>
                      <span className="text-xs font-medium text-slate-400">
                        {comment.createdAt?.toDate ? format(comment.createdAt.toDate(), 'yyyy.MM.dd HH:mm') : ''}
                      </span>
                    </div>
                    <p className="text-slate-700 bg-white p-4 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm inline-block leading-relaxed">
                      {comment.content}
                    </p>
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <div className="text-center py-10 text-slate-400">
                  <MessageSquare size={32} className="mx-auto mb-3 opacity-50" />
                  <p className="font-medium">첫 댓글을 남겨보세요!</p>
                </div>
              )}
            </div>
            <div className="p-5 bg-white border-t border-slate-100">
              <div className="flex gap-3">
                <Input 
                  placeholder="댓글을 남겨보세요..." 
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                  className="flex-1 bg-slate-50 border-slate-200 rounded-xl h-12"
                />
                <Button onClick={handleAddComment} className="rounded-xl h-12 w-12 p-0 bg-indigo-600 hover:bg-indigo-700">
                  <Send size={18} />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          // Search Panel for Personal Manuals
          <div className="flex flex-col h-full">
            <div className="p-6 border-b border-slate-100 bg-white">
              <h3 className="font-bold text-slate-900 text-xl mb-4 flex items-center gap-2">
                <Search size={22} className="text-indigo-500" />
                본문 검색
              </h3>
              <div className="flex gap-2">
                <Input 
                  placeholder="키워드 입력..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="bg-slate-50 border-slate-200 rounded-xl h-12"
                />
                <Button onClick={handleSearch} className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl h-12 px-6 font-bold shadow-sm">검색</Button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              {searchResults.length > 0 ? (
                <div className="space-y-4">
                  <p className="text-xs font-bold text-slate-500 mb-5 uppercase tracking-widest">검색 결과 {searchResults.length}건</p>
                  {searchResults.map((result, idx) => (
                    <div 
                      key={idx}
                      className="p-4 bg-white border border-slate-200 rounded-2xl hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all group"
                      onClick={() => setPageNumber(result.page)}
                    >
                      <div className="text-xs font-bold text-indigo-600 mb-2 bg-indigo-50 inline-block px-2 py-1 rounded-md">Page {result.page}</div>
                      <p className="text-sm text-slate-700 leading-relaxed font-medium">
                        {result.text.split(new RegExp(`(${searchQuery})`, 'gi')).map((part, i) => 
                          part.toLowerCase() === searchQuery.toLowerCase() 
                            ? <span key={i} className="bg-amber-200 text-amber-900 font-bold px-1 rounded">{part}</span> 
                            : part
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              ) : searchQuery ? (
                <div className="text-center py-20 text-slate-400">
                  <Search size={40} className="mx-auto mb-4 opacity-30" strokeWidth={1.5} />
                  <p className="font-bold text-lg text-slate-500">검색 결과가 없습니다.</p>
                </div>
              ) : (
                <div className="text-center py-20 text-slate-400">
                  <FileText size={40} className="mx-auto mb-4 opacity-30" strokeWidth={1.5} />
                  <p className="text-base font-medium leading-relaxed">검색어를 입력하면<br/>해당 내용이 있는 페이지를<br/>찾아줍니다.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
