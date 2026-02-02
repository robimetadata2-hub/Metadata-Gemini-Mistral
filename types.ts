
export type Tab = 'metadata' | 'prompt';

export interface StagedFile {
  file: File;
  id: string;
  status: 'compressing' | 'ready' | 'processing' | 'error';
  thumbnailDataUrl: string;
  apiData: {
    base64Data: string;
    mimeType: string;
  } | null;
}

export interface GeneratedMetadata {
  title?: string;
  description: string;
  keywords?: string[];
  category?: string;
  thumbnailUrl: string;
  filename: string;
  mode: Tab;
  apiData: {
    base64Data: string;
    mimeType: string;
  } | null;
}

export interface ControlSettings {
    activeTab: Tab;
    // Metadata Tab
    titleLength: number;
    descLength: number;
    keywordsCount: number;
    autoDownloadCsv: boolean;
    advanceTitle: {
        transparentBg: boolean;
        whiteBg: boolean;
        vector: boolean;
        illustration: boolean;
    };
    isAdvanceContentHidden: boolean;
    customPromptSelect: 'default' | 'set_custom';
    customPromptEntry: string;
    // Prompt Tab
    descWords: number;
    promptSwitches: {
        silhouette: boolean;
        whiteBg: boolean;
        transparentBg: boolean;
        customPrompt: boolean;
    };
    customPromptEntryPrompt: string;
}

export interface Settings {
    themeColor: string;
    selectedStockSite: string;
    fileExtension: string;
    controls: ControlSettings;
}

export interface ToastInfo {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

// Fix: Add the missing 'HistorySession' type, which was causing an import error in HistoryModal.tsx.
export interface HistorySession {
  id: string;
  timestamp: number;
  itemCount: number;
  metadata: GeneratedMetadata[];
  settings: Settings;
}
