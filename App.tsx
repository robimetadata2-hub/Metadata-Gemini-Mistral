
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
  const currentSessionIdRef = useRef<string | null>(null);

  // FIX: Moved refs to top level to avoid Invalid Hook Call error
  const successCountRef = useRef(0);
  const apiKeyIndexRef = useRef(0);
  const processedCountRef = useRef(0); // Track globally for batch updates

  // Auth & Provider State
  const [selectedProvider, setSelectedProvider] = useState<'mistral' | 'groq' | 'gemini'>('gemini');
  const [mistralApiKeys, setMistralApiKeys] = useState<string[]>([]);
  const [groqCloudApiKeys, setGroqCloudApiKeys] = useState<string[]>([]);
  const [geminiApiKeys, setGeminiApiKeys] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash-image');

  // Refs for API Keys to access latest values inside async loops
  const mistralApiKeysRef = useRef(mistralApiKeys);
  const groqCloudApiKeysRef = useRef(groqCloudApiKeys);
  const geminiApiKeysRef = useRef(geminiApiKeys);

  // Sync Refs with State
  useEffect(() => { mistralApiKeysRef.current = mistralApiKeys; }, [mistralApiKeys]);
  useEffect(() => { groqCloudApiKeysRef.current = groqCloudApiKeys; }, [groqCloudApiKeys]);
  useEffect(() => { geminiApiKeysRef.current = geminiApiKeys; }, [geminiApiKeys]);

  useEffect(() => {
    generatedMetadataRef.current = generatedMetadata;
    settingsRef.current = settings;
  }, [generatedMetadata, settings]);
  
  
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
        
        // Auto-migrate deprecated Groq models
        if (storedProvider === 'groq' && (storedModel === 'llama-3.2-11b-vision-preview' || storedModel === 'llama-3.2-11b-vision-instruct')) {
            const newModel = 'meta-llama/llama-4-scout-17b-16e-instruct';
            setSelectedModel(newModel);
            localStorage.setItem('groqModel', newModel);
        } 
        else if (storedModel) {
            setSelectedModel(storedModel);
        }
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

  // Helper to get fresh keys from Refs
  const getLatestActiveKeys = () => {
    if (selectedProvider === 'mistral') return mistralApiKeysRef.current;
    if (selectedProvider === 'groq') return groqCloudApiKeysRef.current;
    if (selectedProvider === 'gemini') {
        if (geminiApiKeysRef.current.length > 0) return geminiApiKeysRef.current;
        if (process.env.API_KEY) return [process.env.API_KEY];
    }
    return [];
  };

  const startGeneration = async () => {
    // Check initial keys
    const initialKeys = getLatestActiveKeys();
    const providerName = selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1);

    if (initialKeys.length === 0) {
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

    // Create a new Session ID for this batch
    currentSessionIdRef.current = Date.now().toString();

    // Reset counters for new generation run
    successCountRef.current = 0;
    apiKeyIndexRef.current = 0;
    processedCountRef.current = 0;
    
    const totalToProcess = filesToProcess.length;
    const generationMode = settings.controls.activeTab;
    const batchSize = settings.controls.batchSize || 1;
    const rpm = settings.controls.requestsPerMinute || 15; // RPM Setting
    const isRpmEnabled = settings.controls.isRpmEnabled; // RPM Enabled Check

    let requestsInCurrentWindow = 0;
    let windowStartTime = Date.now();

    // --- WORKER FUNCTION FOR A SINGLE FILE ---
    const processSingleFileWorker = async (fileState: StagedFile) => {
         if (generationStopRef.current) return;

         // Set UI to processing
         setStagedFiles(prev => prev.map(f => f.id === fileState.id ? { ...f, status: 'processing' } : f));
         
         // JIT Processing for API Payload
         let apiData = null;
         try {
             apiData = await processFileForApi(fileState);
         } catch (e: any) {
             console.error(`Error processing file data for ${fileState.file.name}`, e);
             setGeneratedMetadata(prev => [...prev, {
                 title: 'Error', description: `Failed to process image: ${e.message}`, keywords: [], category: 'Error',
                 thumbnailUrl: fileState.thumbnailDataUrl, filename: fileState.file.name, mode: generationMode, apiData: null,
             }]);
             setStagedFiles(prev => prev.filter(f => f.id !== fileState.id));
             processedCountRef.current++;
             return;
         }

         // --- RETRY LOOP FOR GENERATION ---
        let attemptsInCycle = 0;
        let success = false;
        let metadataResult = null;

        while (!generationStopRef.current && !success) {
            const currentActiveKeys = getLatestActiveKeys();
            if (currentActiveKeys.length === 0) {
                 showToast("No API keys available.", "error");
                 break; 
            }
            
            if (apiKeyIndexRef.current >= currentActiveKeys.length) {
                apiKeyIndexRef.current = 0;
            }

            const currentKey = currentActiveKeys[apiKeyIndexRef.current];
            const totalKeys = currentActiveKeys.length;

            try {
                const prompt = createPrompt(settings.controls, generationMode);
                const metadata = await callApiWithBackoff(selectedProvider, currentKey, selectedModel, prompt, apiData, settings.controls, generationMode);
                success = true;
                metadataResult = metadata;

            } catch (error: any) {
                if (generationStopRef.current) break;

                const isRateLimit = error instanceof ApiKeyError && (error.message.includes('429') || error.message.toLowerCase().includes('rate limit') || error.message.toLowerCase().includes('quota'));
                const isAuthError = error instanceof ApiKeyError && (error.message.includes('401') || error.message.includes('403') || error.message.toLowerCase().includes('invalid'));

                if (isRateLimit || isAuthError) {
                    // Log internally, but avoid spamming toasts in parallel mode
                    const errorType = isRateLimit ? "Rate limit" : "Auth error";
                    console.warn(`${errorType} on key index ${apiKeyIndexRef.current}.`);
                    
                    if (totalKeys > 1 && attemptsInCycle < totalKeys) {
                        attemptsInCycle++;
                        // Simple Round Robin
                        apiKeyIndexRef.current = (apiKeyIndexRef.current + 1) % totalKeys;
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay before retry
                        continue;
                    }

                    // WAIT LOGIC (simplified for batching)
                    attemptsInCycle = 0;
                    const waitTime = 30000;
                    const checkInterval = 1000;
                    let waited = 0;
                    const keysBeforeWait = getLatestActiveKeys();
                    
                    // Update main progress to show waiting
                    setProgress(prev => ({...prev, status: `Key Limit hit. Waiting 30s or Add Key...`}));

                    while (waited < waitTime) {
                        await new Promise(r => setTimeout(r, checkInterval));
                        waited += checkInterval;
                        if (generationStopRef.current) break;

                        const freshKeys = getLatestActiveKeys();
                        const hasKeysChanged = freshKeys.length !== keysBeforeWait.length || JSON.stringify(freshKeys) !== JSON.stringify(keysBeforeWait);

                        if (hasKeysChanged && freshKeys.length > 0) {
                            if (freshKeys.length > keysBeforeWait.length) {
                                apiKeyIndexRef.current = freshKeys.length - 1;
                            } else {
                                apiKeyIndexRef.current = 0;
                            }
                            break; 
                        }
                    }
                    continue; // Retry loop
                } else {
                    // Fatal Error for this file
                    console.error(`Failed to generate metadata for ${fileState.file.name}:`, error);
                    setGeneratedMetadata(prev => [...prev, {
                        title: 'Error', description: `Failed: ${error.message}`, keywords: [], category: 'Error',
                        thumbnailUrl: fileState.thumbnailDataUrl, filename: fileState.file.name, mode: generationMode, apiData: null,
                    }]);
                    break; // Exit loop, treat as processed (failed)
                }
            }
        }

        if (success && metadataResult) {
            const newMeta: GeneratedMetadata = {
                ...metadataResult,
                thumbnailUrl: fileState.thumbnailDataUrl,
                filename: fileState.file.name,
                mode: generationMode,
                apiData: null,
                originalFile: fileState.file
            };
            setGeneratedMetadata(prev => [...prev, newMeta]);
            successCountRef.current++;

             // Incremental History
            const historyMetaItem = { ...newMeta, thumbnailUrl: '', apiData: null, originalFile: undefined };
            setHistory(prev => {
                const sessionId = currentSessionIdRef.current;
                if (!sessionId) return prev; 
                const existingSessionIndex = prev.findIndex(s => s.id === sessionId);
                let newHistory = [...prev];
                if (existingSessionIndex > -1) {
                    const session = { ...newHistory[existingSessionIndex] };
                    session.metadata = [historyMetaItem, ...session.metadata];
                    session.itemCount = session.metadata.length;
                    newHistory[existingSessionIndex] = session;
                } else {
                    const newSession: HistorySession = {
                        id: sessionId, timestamp: Date.now(), itemCount: 1, metadata: [historyMetaItem], settings: settingsRef.current
                    };
                    newHistory = [newSession, ...prev];
                }
                try { localStorage.setItem('generationHistory', JSON.stringify(newHistory)); } catch(e) { console.error("History Save Error", e); }
                return newHistory;
            });
        }

        // Cleanup
        setStagedFiles(prev => prev.filter(f => f.id !== fileState.id));
        processedCountRef.current++;
        
        // Update Progress
        setProgress({
            percent: (processedCountRef.current / totalToProcess) * 100,
            status: `Generated ${processedCountRef.current}/${totalToProcess} | ${successCountRef.current} successful`,
            currentFile: processedCountRef.current,
            totalFiles: totalToProcess
        });
    };
    // -------------------------------------

    // BATCH PROCESSING LOOP
    for (let i = 0; i < filesToProcess.length; i += batchSize) {
        if (generationStopRef.current) break;

        // RPM Rate Limiting Check
        // Only enforce if enabled
        if (isRpmEnabled) {
            // If we have already sent requests in this window, check if next batch exceeds RPM
            const currentBatchCount = Math.min(batchSize, filesToProcess.length - i);
            
            if (requestsInCurrentWindow > 0 && (requestsInCurrentWindow + currentBatchCount) > rpm) {
                const now = Date.now();
                const elapsed = now - windowStartTime;
                
                if (elapsed < 60000) {
                    const waitTime = 60000 - elapsed + 1000; // +1s buffer
                    
                    // Wait loop
                    let remaining = waitTime;
                    while (remaining > 0) {
                        if (generationStopRef.current) break;
                        setProgress(prev => ({...prev, status: `RPM Limit (${rpm}/min) reached. Pausing for ${Math.ceil(remaining/1000)}s...`}));
                        await new Promise(r => setTimeout(r, 1000));
                        remaining -= 1000;
                    }
                    if (generationStopRef.current) break;
                }
                
                // Reset for new window
                windowStartTime = Date.now();
                requestsInCurrentWindow = 0;
            } else if (Date.now() - windowStartTime >= 60000) {
                // If minute passed naturally
                windowStartTime = Date.now();
                requestsInCurrentWindow = 0;
            }
        }

        // Pause Check
        while (isPaused) {
            if (generationStopRef.current) break;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (generationStopRef.current) break;

        const batch = filesToProcess.slice(i, i + batchSize);
        if (isRpmEnabled) {
            requestsInCurrentWindow += batch.length; // Count these requests
        }
        
        // Execute batch in parallel and wait for all to finish
        await Promise.all(batch.map(file => processSingleFileWorker(file)));
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
        if (settingsRef.current.controls.autoDownloadCsv && successCountRef.current > 0) {
            setTimeout(() => handleExportCsv(), 500);
        }
        setIsCompletionModalOpen(true);
    }
  };

  const handleRegenerate = async (item: GeneratedMetadata) => {
    if (!item.originalFile) {
        showToast("Cannot regenerate this item (original file missing).", "error");
        return;
    }

    const activeKeys = getLatestActiveKeys();
    if (activeKeys.length === 0) {
        showToast("No API Key found. Check settings.", "error");
        return;
    }

    showToast(`Regenerating ${item.filename}...`, "info");
    
    // Create a temporary StagedFile-like object
    const tempFileId = `regen-${Date.now()}`;
    const tempStagedFile: StagedFile = {
        file: item.originalFile,
        id: tempFileId,
        status: 'processing',
        thumbnailDataUrl: item.thumbnailUrl,
        apiData: null
    };

    try {
        const apiData = await processFileForApi(tempStagedFile);
        const generationMode = settings.controls.activeTab;
        
        // Use current API Key index
        let currentKey = activeKeys[apiKeyIndexRef.current];
        // Ensure index is valid
        if (!currentKey) {
             apiKeyIndexRef.current = 0;
             currentKey = activeKeys[0];
        }

        const prompt = createPrompt(settings.controls, generationMode);
        
        try {
             const metadata = await callApiWithBackoff(selectedProvider, currentKey, selectedModel, prompt, apiData, settings.controls, generationMode);
             
             // Update the item in the list
             setGeneratedMetadata(prev => prev.map(m => {
                 if (m.filename === item.filename) {
                     return {
                         ...m,
                         ...metadata, // Overwrite with new data
                         title: metadata.title || m.title,
                         description: metadata.description || m.description,
                         keywords: metadata.keywords || m.keywords,
                         category: metadata.category || m.category,
                     };
                 }
                 return m;
             }));
             
             showToast("Regeneration successful!", "success");

        } catch (error: any) {
             // Simple fallback for single item
             if (activeKeys.length > 1) {
                 apiKeyIndexRef.current = (apiKeyIndexRef.current + 1) % activeKeys.length;
                 const nextKey = activeKeys[apiKeyIndexRef.current];
                 const metadata = await callApiWithBackoff(selectedProvider, nextKey, selectedModel, prompt, apiData, settings.controls, generationMode);
                 setGeneratedMetadata(prev => prev.map(m => {
                    if (m.filename === item.filename) { return { ...m, ...metadata }; }
                    return m;
                 }));
                 showToast("Regeneration successful (switched key)!", "success");
            } else {
                 throw error;
            }
        }

    } catch (e: any) {
        console.error("Regeneration failed:", e);
        showToast(`Regeneration failed: ${e.message}`, "error");
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
                onRegenerate={handleRegenerate}
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
