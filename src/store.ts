import { create } from 'zustand';
import { User } from 'firebase/auth';

export type ModalType = 'main' | 'warehouse' | 'viewer' | 'settings';

export interface Manual {
  id: string;
  ownerId: string;
  fileName: string;
  productName: string;
  driveFileId?: string;
  ocrText?: string;
  ocrStatus?: 'pending' | 'completed' | 'failed';
  createdAt: any;
}

export interface SharedManual {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  title: string;
  description?: string;
  fileName: string;
  downloadUrl: string;
  likesCount: number;
  commentsCount: number;
  createdAt: any;
}

interface AppState {
  user: User | null;
  setUser: (user: User | null) => void;
  driveToken: string | null;
  setDriveToken: (token: string | null) => void;
  activeModal: ModalType;
  setActiveModal: (modal: ModalType) => void;
  selectedManual: Manual | SharedManual | null;
  setSelectedManual: (manual: Manual | SharedManual | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  driveToken: null,
  setDriveToken: (token) => set({ driveToken: token }),
  activeModal: 'main',
  setActiveModal: (modal) => set({ activeModal: modal }),
  selectedManual: null,
  setSelectedManual: (manual) => set({ selectedManual: manual }),
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
