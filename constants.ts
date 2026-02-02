
import { Settings } from './types';

export const GALLERY_DISPLAY_LIMIT = 24;

export const DEFAULT_SETTINGS: Settings = {
  themeColor: '#f05a27',
  selectedStockSite: 'General',
  fileExtension: 'default',
  controls: {
    activeTab: 'metadata',
    titleLength: 60,
    descLength: 150,
    keywordsCount: 30,
    autoDownloadCsv: false,
    advanceTitle: {
      transparentBg: false,
      whiteBg: false,
      vector: false,
      illustration: false,
    },
    isAdvanceContentHidden: true,
    customPromptSelect: 'default',
    customPromptEntry: '',
    descWords: 40,
    promptSwitches: {
      silhouette: false,
      whiteBg: false,
      transparentBg: false,
      customPrompt: false,
    },
    customPromptEntryPrompt: '',
  }
};
