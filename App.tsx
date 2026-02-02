
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { UploadPanel } from './components/UploadPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { Footer } from './components/Footer';
import { ApiKeyModal } from './components/modals/ApiKeyModal';
import { CompletionModal } from './components/modals/CompletionModal';
import { TutorialModal } from './components/modals/TutorialModal';
import { HistoryModal } from './components/modals/HistoryModal';
import { Toast } from './components/Toast';
import { StagedFile, GeneratedMetadata, Settings, ToastInfo, ControlSettings, Tab, HistorySession } from './types';
import { callApiWithBackoff, createPrompt, ApiKeyError } from './services/geminiService';
import { processFileForApi } from './services/fileProcessor';
import { DEFAULT_SETTINGS } from './constants';

const App: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [generatedMetadata, setGeneratedMetadata] = useState<GeneratedMetadata[]>([]);
  const [history, setHistory] = useState<HistorySession[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  // Refs to track latest state for async operations
  const generationStopRef = useRef(false);
  const generatedMetadataRef = useRef(generatedMetadata);
  const settingsRef = useRef(settings);

  // FIX: Moved refs to top level to avoid Invalid Hook Call error
  const successCountRef = useRef(0);
  const apiKeyIndexRef = useRef(0);

  useEffect(() => {
    generatedMetadataRef.current = generatedMetadata;
    settingsRef.current = settings;
  }, [generatedMetadata, settings]);
  
  // Auth & Provider State
  const [selectedProvider, setSelectedProvider] = useState<'mistral' | 'groq' | 'gemini'>('gemini');
  const [mistralApiKeys, setMistralApiKeys] = useState<string[]>([]);
  const [groqCloudApiKeys, setGroqCloudApiKeys] = useState<string[]>([]);
  const [geminiApiKeys, setGeminiApiKeys] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash-image');
  
  const [progress, setProgress] = useState({ percent: 0, status: 'Ready.', currentFile: 0, totalFiles: 0 });
  
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  
  const [completionStats, setCompletionStats] = useState({ success: 0, total: 0 });
  
  const [toast, setToast] = useState<ToastInfo | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ id: Date.now(), message, type });
  }, []);
  
  // Effect for initializing and loading data from localStorage
  useEffect(() => {
    // Load Provider
    const storedProvider = localStorage.getItem('aiProvider');
    if (storedProvider === 'mistral' || storedProvider === 'groq' || storedProvider === 'gemini') {
        setSelectedProvider(storedProvider as any);
        const storedModel = localStorage.getItem(`${storedProvider}Model`);
        if (storedModel) setSelectedModel(storedModel);
        else { // Set default model for provider
            if (storedProvider === 'mistral') setSelectedModel('pixtral-12b-2409');
            else if (storedProvider === 'groq') setSelectedModel('meta-llama/llama-4-scout-17b-16e-instruct');
            else if (storedProvider === 'gemini') setSelectedModel('gemini-2.5-flash-image');
        }
    }

    // Load Mistral Keys
    try {
      const storedMistralKeys = localStorage.getItem('mistralApiKeys');
      if (storedMistralKeys) setMistralApiKeys(JSON.parse(storedMistralKeys));
    } catch (e) { console.error("Failed to parse Mistral API keys", e); }
    
    // Load Groq Cloud Keys
    try {
      const storedGroqKeys = localStorage.getItem('groqCloudApiKeys');
      if (storedGroqKeys) setGroqCloudApiKeys(JSON.parse(storedGroqKeys));
    } catch (e) { console.error("Failed to parse Groq Cloud API keys", e); }
    
    // Load Gemini Keys
    try {
      const storedGeminiKeys = localStorage.getItem('geminiApiKeys');
      if (storedGeminiKeys) setGeminiApiKeys(JSON.parse(storedGeminiKeys));
    } catch (e) { console.error("Failed to parse Gemini API keys", e); }

    // Load History
    try {
      const storedHistory = localStorage.getItem('generationHistory');
      if (storedHistory) setHistory(JSON.parse(storedHistory));
    } catch (e) { console.error("Failed to parse history", e); }

    // Load Settings
    try {
      const storedSettings = localStorage.getItem('appSettings');
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings);
        const mergedControls = { ...DEFAULT_SETTINGS.controls, ...(parsedSettings.controls || {}) };
        
        setSettings(s => ({ 
            ...s, 
            ...parsedSettings,
            controls: mergedControls
        }));
        setThemeColor(parsedSettings.themeColor || DEFAULT_SETTINGS.themeColor);
      } else {
        setThemeColor(DEFAULT_SETTINGS.themeColor);
      }
    } catch (e) { 
        console.error("Failed to parse settings from localStorage", e);
        setThemeColor(DEFAULT_SETTINGS.themeColor);
    }
  }, []);

  const setThemeColor = (color: string) => {
    document.documentElement.style.setProperty('--theme-color', color);
    const hoverColor = lightenDarkenColor(color, 20);
    document.documentElement.style.setProperty('--theme-color-hover', hoverColor);
    document.documentElement.style.setProperty('--theme-color-active-bg', color + '1a');
    document.documentElement.style.setProperty('--theme-color-shadow', color + '33');
    setSettings(s => ({...s, themeColor: color}));
  };

  const lightenDarkenColor = (col: string, amt: number) => {
    let usePound = false;
    if (col[0] === "#") {
        col = col.slice(1);
        usePound = true;
    }
    const num = parseInt(col, 16);
    let r = (num >> 16) + amt;
    if (r > 255) r = 255;
    else if (r < 0) r = 0;
    let b = ((num >> 8) & 0x00FF) + amt;
    if (b > 255) b = 255;
    else if (b < 0) b = 0;
    let g = (num & 0x0000FF) + amt;
    if (g > 255) g = 255;
    else if (g < 0) g = 0;
    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
  };

  const handleControlSettingsChange = (newControlSettings: ControlSettings) => {
    setSettings(s => ({...s, controls: newControlSettings}));
  }

  const handleSaveSettings = () => {
    try {
      localStorage.setItem('appSettings', JSON.stringify(settings));
      showToast('Settings saved successfully!', 'success');
    } catch(e) {
      console.error("Error saving settings:", e);
      showToast('Could not save settings.', 'error');
    }
  };

  const clearAll = () => {
    generationStopRef.current = true;
    setIsGenerating(false);
    setStagedFiles([]);
    setGeneratedMetadata([]);
    setProgress({ percent: 0, status: 'Ready.', currentFile: 0, totalFiles: 0 });
    setIsPaused(false);
    showToast('All files and current results have been cleared.', 'info');
  };

  const handleExportCsv = () => {
    const currentMetadata = generatedMetadataRef.current;
    const currentSettings = settingsRef.current;

    if (currentMetadata.length === 0) {
        showToast('No metadata available to export.', 'warning');
        return;
    }

    const escapeCsv = (str: string | undefined | number) => `"${(String(str ?? '').replace(/"/g, '""'))}"`;
    const getFilenameWithNewExtension = (originalFilename: string, fileExtension: string) => {
        if (fileExtension === 'default' || !fileExtension) return originalFilename;
        const lastDotIndex = originalFilename.lastIndexOf('.');
        if (lastDotIndex === -1) return `${originalFilename}.${fileExtension}`;
        const nameWithoutExtension = originalFilename.substring(0, lastDotIndex);
        return `${nameWithoutExtension}.${fileExtension}`;
    };

    let csvContent = "";
    const generationMode = currentMetadata[0].mode;
    
    if (generationMode === 'prompt') {
        const headers = ['serial number', 'Description'];
        const rows = currentMetadata
            .filter(item => item.mode === 'prompt')
            .map((item, index) => [index + 1, item.description].map(escapeCsv).join(','));
        csvContent = headers.join(',') + '\n' + rows.join('\n');
    } else {
        let headers: string[] = [];
        let rows: string[] = [];
        const metadataItems = currentMetadata.filter(item => item.mode === 'metadata');

        switch (currentSettings.selectedStockSite) {
            case 'adobe-stock':
                headers = ['Filename', 'Title', 'Keywords', 'Category'];
                rows = metadataItems.map(r => [getFilenameWithNewExtension(r.filename, currentSettings.fileExtension), r.title, r.keywords?.join(', '), r.category].map(escapeCsv).join(','));
                break;
            case 'shutterstock':
                headers = ['Filename', 'Description', 'Keywords', 'Categorie'];
                rows = metadataItems.map(r => [getFilenameWithNewExtension(r.filename, currentSettings.fileExtension), r.title, r.keywords?.slice(0, 50).join(','), r.category].map(escapeCsv).join(','));
                break;
            default:
                headers = ['Filename', 'Title', 'Description', 'Keywords', 'Category'];
                rows = metadataItems.map(r => [getFilenameWithNewExtension(r.filename, currentSettings.fileExtension), r.title, r.description, r.keywords?.join(', '), r.category].map(escapeCsv).join(','));
                break;
        }
        if (rows.length > 0) {
           csvContent = headers.join(',') + '\n' + rows.join('\n');
        }
    }

    if (!csvContent.trim()) {
        showToast('No data to export for the selected mode.', 'warning');
        return;
    }

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const filename = generationMode === 'prompt' ? `${currentSettings.selectedStockSite}_prompts.csv` : `${currentSettings.selectedStockSite}_metadata.csv`;
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV exported successfully.', 'success');
  };

  const startGeneration = async () => {
    let activeKeys: string[] = [];
    const providerName = selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1);

    if (selectedProvider === 'mistral') activeKeys = mistralApiKeys;
    else if (selectedProvider === 'groq') activeKeys = groqCloudApiKeys;
    else if (selectedProvider === 'gemini') {
        if (geminiApiKeys.length > 0) activeKeys = geminiApiKeys;
        else if (process.env.API_KEY) activeKeys = [process.env.API_KEY];
    }

    if (activeKeys.length === 0) {
      showToast(`No API Key found for ${providerName}. Please check settings.`, 'error');
      setIsApiKeyModalOpen(true);
      return;
    }

    const filesToProcess = stagedFiles.filter(f => f.status === 'ready');
    if (filesToProcess.length === 0) {
      showToast(stagedFiles.length > 0 ? 'Files are not ready for processing.' : 'No files uploaded to generate.', 'info');
      return;
    }

    generationStopRef.current = false;
    setIsGenerating(true);
    setIsPaused(false);

    // Reset counters for new generation run
    successCountRef.current = 0;
    apiKeyIndexRef.current = 0;
    
    const totalToProcess = filesToProcess.length;
    let processedCount = 0;
    
    const generationMode = settings.controls.activeTab;
    const currentSessionMetadata: GeneratedMetadata[] = [];

    const processSingleFile = async (fileData: StagedFile, apiData: any, mode: Tab) => {
        let attemptsInCycle = 0;
        const totalKeys = activeKeys.length;

        // Loop indefinitely until success, stop, or non-retriable error (handled inside)
        while (!generationStopRef.current) {
            const currentKey = activeKeys[apiKeyIndexRef.current];
            
            try {
                const prompt = createPrompt(settings.controls, mode);
                const metadata = await callApiWithBackoff(selectedProvider, currentKey, selectedModel, prompt, apiData, settings.controls, mode);
                // Success
                return { status: 'success' as const, metadata };

            } catch (error: any) {
                if (generationStopRef.current) return { status: 'stopped' as const };

                // Check for API Key specific errors (Rate Limit, Quota, Invalid Key)
                const isRateLimit = error instanceof ApiKeyError && (error.message.includes('429') || error.message.toLowerCase().includes('rate limit') || error.message.toLowerCase().includes('quota'));
                const isAuthError = error instanceof ApiKeyError && (error.message.includes('401') || error.message.includes('403') || error.message.toLowerCase().includes('invalid'));

                if (isRateLimit || isAuthError) {
                    const errorType = isRateLimit ? "Rate limit" : "Auth error";
                    console.warn(`${errorType} on key index ${apiKeyIndexRef.current}. Switching key.`);
                    
                    attemptsInCycle++;
                    
                    // Rotate to next key
                    apiKeyIndexRef.current = (apiKeyIndexRef.current + 1) % totalKeys;
                    
                    // If we cycled through all keys
                    if (attemptsInCycle >= totalKeys) {
                        if (isRateLimit) {
                            // If all keys are rate limited, we wait longer and retry the cycle
                            const waitTime = 5000;
                            setProgress(prev => ({...prev, status: `All keys busy. Retrying in ${waitTime/1000}s...`}));
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                            attemptsInCycle = 0; // Reset cycle count to keep trying
                        } else {
                            // If all keys are Invalid (Auth Error), we can't recover.
                            return { status: 'error' as const, error: new Error("All provided API keys are invalid or expired.") };
                        }
                    } else {
                        // Just a quick switch to next key
                        if (isRateLimit) {
                            setProgress(prev => ({...prev, status: `Rate limited. Switching key...`}));
                            // Small delay to be polite and prevent tight loop on small key sets
                            await new Promise(resolve => setTimeout(resolve, 1500)); 
                        }
                    }
                    continue; // Retry with new key
                }
                
                // For other errors (persistent 500s, malformed data, etc) that survived internal retries
                return { status: 'error' as const, error };
            }
        }
        return { status: 'stopped' as const };
    };

    for (const fileState of filesToProcess) {
        if (generationStopRef.current) break;

        while (isPaused) {
            if (generationStopRef.current) break;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (generationStopRef.current) break;

        setStagedFiles(prev => prev.map(f => f.id === fileState.id ? { ...f, status: 'processing' } : f));
        
        // JIT Processing: Generate API payload (Base64) only when needed
        let apiData = null;
        let generationResult;

        try {
            const apiResult = await processFileForApi(fileState);
            apiData = apiResult;
            generationResult = await processSingleFile(fileState, apiData, generationMode);
        } catch (e: any) {
             generationResult = { status: 'error' as const, error: new Error("Failed to process image data: " + e.message) };
        }
        
        if (generationStopRef.current) break;

        if (generationResult.status === 'success') {
            const newMeta: GeneratedMetadata = {
                ...generationResult.metadata,
                thumbnailUrl: fileState.thumbnailDataUrl,
                filename: fileState.file.name,
                mode: generationMode,
                apiData: null, // Don't store large base64 data in results
            };
            setGeneratedMetadata(prev => [...prev, newMeta]);
            currentSessionMetadata.push(newMeta);
            successCountRef.current++;
        } else if (generationResult.status === 'error') {
            const errorMsg = generationResult.error instanceof Error ? generationResult.error.message : "Unknown error";
            console.error(`Failed to generate metadata for ${fileState.file.name}:`, errorMsg);
            showToast(`Failed for ${fileState.file.name}: ${errorMsg}`, 'error');
            const errorMeta: GeneratedMetadata = {
                title: 'Error', description: `Failed: ${errorMsg}`, keywords: [], category: 'Error',
                thumbnailUrl: fileState.thumbnailDataUrl, filename: fileState.file.name, mode: generationMode, apiData: null,
            };
            setGeneratedMetadata(prev => [...prev, errorMeta]);
        }
        
        // Clear processed file from staging to free memory immediately
        setStagedFiles(prev => prev.filter(f => f.id !== fileState.id));
        processedCount++;
        setProgress({
            percent: (processedCount / totalToProcess) * 100,
            status: `Generated ${processedCount}/${totalToProcess} | ${successCountRef.current} successful`,
            currentFile: processedCount,
            totalFiles: totalToProcess
        });
    }
    
    setIsGenerating(false);

    if (generationStopRef.current) {
        showToast('Generation stopped.', 'info');
        setProgress(prev => ({...prev, status: 'Stopped.'}));
    } else {
        setProgress({ percent: 100, status: `Complete. ${successCountRef.current} of ${totalToProcess} successful.`, currentFile: totalToProcess, totalFiles: totalToProcess });
    }
    
    setCompletionStats({ success: successCountRef.current, total: totalToProcess });
    
    if (!generationStopRef.current && totalToProcess > 0) {
        // Save to History (Strip images to save LocalStorage space)
        if (currentSessionMetadata.length > 0) {
            // Create a lightweight version for history (no thumbnails/base64)
            const historyMetadata = currentSessionMetadata.map(m => ({
                ...m,
                thumbnailUrl: '', // Clear thumbnail to save space
                apiData: null
            }));

            const newSession: HistorySession = {
                id: Date.now().toString(),
                timestamp: Date.now(),
                itemCount: historyMetadata.length,
                metadata: historyMetadata,
                settings: settingsRef.current
            };
            setHistory(prev => {
                const updated = [newSession, ...prev];
                try {
                    localStorage.setItem('generationHistory', JSON.stringify(updated));
                } catch(e) {
                    console.error("LocalStorage quota exceeded, history not saved.", e);
                    showToast("History full. Oldest sessions removed automatically.", 'warning');
                    // Simple eviction strategy could be added here if needed
                }
                return updated;
            });
        }

        if (settingsRef.current.controls.autoDownloadCsv && successCountRef.current > 0) {
            setTimeout(() => handleExportCsv(), 500);
        }
        setIsCompletionModalOpen(true);
    }
  };

  return (
    <div className="flex flex-col min-h-screen text-gray-200">
      <Header 
        onTutorialClick={() => setIsTutorialModalOpen(true)}
      />
      <main className="flex-grow container mx-auto px-4 lg:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-1">
            <ControlPanel 
              settings={settings.controls}
              onSettingsChange={handleControlSettingsChange}
              onSave={handleSaveSettings}
              onApiKeyClick={() => setIsApiKeyModalOpen(true)}
              themeColor={settings.themeColor}
              onThemeColorChange={setThemeColor}
              fileExtension={settings.fileExtension}
              onFileExtensionChange={(ext) => setSettings(s => ({...s, fileExtension: ext}))}
            />
          </div>
          <div className="lg:col-span-2 space-y-6">
            <UploadPanel 
              stagedFiles={stagedFiles}
              setStagedFiles={setStagedFiles}
              progress={progress}
              isGenerating={isGenerating}
              isPaused={isPaused}
              setIsPaused={setIsPaused}
              startGeneration={startGeneration}
              generatedMetadata={generatedMetadata}
              setProgress={setProgress}
              showToast={showToast}
              selectedStockSite={settings.selectedStockSite}
              onStockSiteChange={(site) => setSettings(s => ({...s, selectedStockSite: site}))}
              fileExtension={settings.fileExtension}
              clearAll={clearAll}
              onExportCsv={handleExportCsv}
              onHistoryClick={() => setIsHistoryModalOpen(true)}
            />
            <ResultsPanel
                metadata={generatedMetadata}
                setMetadata={setGeneratedMetadata}
                showToast={showToast}
            />
          </div>
        </div>
      </main>
      <Footer />
      
      <ApiKeyModal 
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        mistralApiKeys={mistralApiKeys}
        setMistralApiKeys={setMistralApiKeys}
        groqCloudApiKeys={groqCloudApiKeys}
        setGroqCloudApiKeys={setGroqCloudApiKeys}
        geminiApiKeys={geminiApiKeys}
        setGeminiApiKeys={setGeminiApiKeys}
        selectedProvider={selectedProvider}
        setSelectedProvider={setSelectedProvider}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        showToast={showToast}
        themeColor={settings.themeColor}
      />

      <CompletionModal
        isOpen={isCompletionModalOpen}
        onClose={() => setIsCompletionModalOpen(false)}
        stats={completionStats}
        generatedMetadata={generatedMetadata}
        selectedStockSite={settings.selectedStockSite}
        fileExtension={settings.fileExtension}
      />
      
      <HistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        history={history}
        setHistory={setHistory}
        showToast={showToast}
      />
      
      <TutorialModal
        isOpen={isTutorialModalOpen}
        onClose={() => setIsTutorialModalOpen(false)}
      />

      {toast && (
        <Toast 
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default App;
