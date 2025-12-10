
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Header } from './components/Header';
import { ControlPanel } from './components/ControlPanel';
import { UploadPanel } from './components/UploadPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { Footer } from './components/Footer';
import { ApiKeyModal } from './components/modals/ApiKeyModal';
import { CompletionModal } from './components/modals/CompletionModal';
import { TutorialModal } from './components/modals/TutorialModal';
import { Toast } from './components/Toast';
import { StagedFile, GeneratedMetadata, Settings, ToastInfo, ControlSettings } from './types';
import { callApiWithBackoff, createPrompt } from './services/geminiService';
import { DEFAULT_SETTINGS, REQUEST_PER_MINUTE, BATCH_SIZE } from './constants';

const App: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [generatedMetadata, setGeneratedMetadata] = useState<GeneratedMetadata[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const generationStopRef = useRef(false);
  
  // Auth & Provider State
  const [selectedProvider, setSelectedProvider] = useState<'gemini' | 'grok' | 'mistral'>('gemini');
  const [apiKeys, setApiKeys] = useState<string[]>([]); // Gemini Keys
  const [grokApiKeys, setGrokApiKeys] = useState<string[]>([]); // Grok Keys
  const [mistralApiKeys, setMistralApiKeys] = useState<string[]>([]); // Mistral Keys
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  
  const [progress, setProgress] = useState({ percent: 0, status: 'Ready.', currentFile: 0, totalFiles: 0 });
  
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState(false);
  const [completionStats, setCompletionStats] = useState({ success: 0, total: 0 });
  
  const [toast, setToast] = useState<ToastInfo | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ id: Date.now(), message, type });
  }, []);
  
  // Effect for initializing and loading data from localStorage
  useEffect(() => {
    // Load Provider
    const storedProvider = localStorage.getItem('aiProvider');
    if (storedProvider === 'gemini' || storedProvider === 'grok' || storedProvider === 'mistral') {
        setSelectedProvider(storedProvider);
        
        // Load appropriate model for provider
        if (storedProvider === 'gemini') {
            const storedModel = localStorage.getItem('geminiModel');
            if (storedModel) setSelectedModel(storedModel);
            else setSelectedModel('gemini-2.5-flash');
        } else if (storedProvider === 'grok') {
            const storedModel = localStorage.getItem('grokModel');
            if (storedModel) setSelectedModel(storedModel);
            else setSelectedModel('grok-2-vision-1212');
        } else { // mistral
            const storedModel = localStorage.getItem('mistralModel');
            if (storedModel) setSelectedModel(storedModel);
            else setSelectedModel('pixtral-12b-2409');
        }
    } else {
        // Default to Gemini
        const storedModel = localStorage.getItem('geminiModel');
        if (storedModel) setSelectedModel(storedModel);
    }

    // Load Gemini Keys
    try {
      const storedKeys = localStorage.getItem('geminiApiKeys');
      if (storedKeys) setApiKeys(JSON.parse(storedKeys));
    } catch (e) { console.error("Failed to parse Gemini API keys", e); }

    // Load Grok Keys
    try {
      const storedGrokKeys = localStorage.getItem('grokApiKeys');
      if (storedGrokKeys) setGrokApiKeys(JSON.parse(storedGrokKeys));
    } catch (e) { console.error("Failed to parse Grok API keys", e); }

    // Load Mistral Keys
    try {
      const storedMistralKeys = localStorage.getItem('mistralApiKeys');
      if (storedMistralKeys) setMistralApiKeys(JSON.parse(storedMistralKeys));
    } catch (e) { console.error("Failed to parse Mistral API keys", e); }
    
    // Load Settings
    try {
      const storedSettings = localStorage.getItem('appSettings');
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings);
        
        // Deep merge for controls
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
    
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    showToast('All files and results have been cleared.', 'info');
  };

  const startGeneration = async () => {
    // Validate Keys based on Provider
    let activeKeys: string[] = [];
    let providerName = '';
    
    if (selectedProvider === 'gemini') {
        activeKeys = apiKeys;
        providerName = 'Google Gemini';
    } else if (selectedProvider === 'grok') {
        activeKeys = grokApiKeys;
        providerName = 'xAI Grok';
    } else {
        activeKeys = mistralApiKeys;
        providerName = 'Mistral AI';
    }

    if (!activeKeys[0]) {
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
    
    const totalToProcess = filesToProcess.length;
    let processedCount = 0;
    let successCount = 0;
    const retryQueue: StagedFile[] = [];
    const generationMode = settings.controls.activeTab;

    let currentApiKeyIndex = 0;
    const requestCounts = new Array(activeKeys.length).fill(0);
    let minuteStart = Date.now();

    const processFile = async ({ fileState, keyIndex }: { fileState: StagedFile; keyIndex: number }) => {
        setStagedFiles(prev => prev.map(f => f.id === fileState.id ? { ...f, status: 'processing' } : f));
        try {
            const prompt = createPrompt(settings.controls, generationMode);
            const onRetryCallback = (retryDelay: number) => {
                console.log(`Retrying ${fileState.file.name} in ${Math.ceil(retryDelay / 1000)}s...`);
            };
            
            // NOTE: We pass the provider, the specific key, and the model
            const metadata = await callApiWithBackoff(
                selectedProvider,
                activeKeys[keyIndex], 
                selectedModel, 
                prompt, 
                fileState.apiData, 
                settings.controls, 
                generationMode, 
                onRetryCallback
            );
            return { status: 'success' as const, metadata, fileState };
        } catch (error: any) {
            return { status: 'error' as const, error, fileState };
        }
    };
    
    const runGenerationLoop = async (files: StagedFile[], isRetryPass: boolean) => {
        // Force batch size to 1 for Mistral to support free tier rate limits (usually 1 req/sec)
        const userBatchSize = settings.controls.batchSize || BATCH_SIZE;
        const batchSize = selectedProvider === 'mistral' ? 1 : userBatchSize;

        for (let i = 0; i < files.length; i += batchSize) {
            if (generationStopRef.current) break;
          
            while (isPaused) {
                setIsGenerating(false);
                showToast('Generation paused.', 'info');
                await new Promise(resolve => {
                    const interval = setInterval(() => {
                        if (!isPaused || generationStopRef.current) {
                            clearInterval(interval);
                            resolve(null);
                        }
                    }, 100);
                });
                if (generationStopRef.current) break;
                setIsGenerating(true); // Resume
            }
            if (generationStopRef.current) break;
            
            const batchFiles = files.slice(i, i + batchSize);
            
            // Rate-limiting and key assignment logic
            let assignedKeyIndex = -1;
            let keyFoundForBatch = false;
            while (!keyFoundForBatch) {
                if (Date.now() - minuteStart > 60000) {
                    minuteStart = Date.now();
                    requestCounts.fill(0);
                }
                const initialSearchIndex = currentApiKeyIndex;
                do {
                    if (requestCounts[currentApiKeyIndex] + batchFiles.length <= REQUEST_PER_MINUTE) {
                        assignedKeyIndex = currentApiKeyIndex;
                        keyFoundForBatch = true;
                        break;
                    }
                    currentApiKeyIndex = (currentApiKeyIndex + 1) % activeKeys.length;
                } while (currentApiKeyIndex !== initialSearchIndex);

                if (!keyFoundForBatch) {
                    const waitEndTime = minuteStart + 61000;
                    let waitInterval: any;
                    await new Promise(resolve => {
                        const updateCountdown = () => {
                            const remainingTime = Math.max(0, waitEndTime - Date.now());
                            setProgress(prev => ({ ...prev, status: `All keys rate-limited. Waiting ${Math.ceil(remainingTime / 1000)}s...` }));
                            if (remainingTime <= 0) {
                                if (waitInterval) clearInterval(waitInterval);
                                resolve(null);
                            }
                        };
                        updateCountdown();
                        waitInterval = setInterval(updateCountdown, 1000);
                    });
                }
            }
            requestCounts[assignedKeyIndex] += batchFiles.length;
            const batchWithKeys = batchFiles.map(fileState => ({ fileState, keyIndex: assignedKeyIndex }));
            currentApiKeyIndex = (assignedKeyIndex + 1) % activeKeys.length;
            // End rate-limiting logic

            const results = await Promise.all(batchWithKeys.map(item => processFile(item)));

            for (const result of results) {
                if (generationStopRef.current) break;

                const { fileState } = result;

                if (result.status === 'success') {
                    setGeneratedMetadata(prev => [...prev, {
                        ...result.metadata,
                        thumbnailUrl: fileState.thumbnailDataUrl,
                        filename: fileState.file.name,
                        mode: generationMode,
                        apiData: fileState.apiData,
                    }]);
                    successCount++;
                    setStagedFiles(prev => prev.filter(f => f.id !== fileState.id));
                } else if (result.status === 'error') {
                    if (isRetryPass) { // Final failure on retry
                        console.error(`Failed to generate metadata for ${fileState.file.name} on retry:`, result.error);
                        showToast(`Retry failed for ${fileState.file.name}: ${result.error.message}`, 'error');
                        setGeneratedMetadata(prev => [...prev, {
                            title: 'Error', description: `Failed: ${result.error.message}`, keywords: [], category: 'Error',
                            thumbnailUrl: fileState.thumbnailDataUrl, filename: fileState.file.name, mode: generationMode, apiData: fileState.apiData,
                        }]);
                        setStagedFiles(prev => prev.filter(f => f.id !== fileState.id));
                    } else { // First failure, queue for retry
                        console.error(`Failed to generate metadata for ${fileState.file.name}:`, result.error);
                        showToast(`Error for ${fileState.file.name}. It will be retried later.`, 'warning');
                        retryQueue.push(fileState);
                        setStagedFiles(prev => prev.map(f => f.id === fileState.id ? { ...f, status: 'error' } : f));
                    }
                }
                
                if (!isRetryPass) {
                    processedCount++;
                    setProgress({ 
                        percent: (processedCount / totalToProcess) * 100, 
                        status: `Generated ${processedCount}/${totalToProcess} | ${successCount} successful`, 
                        currentFile: processedCount, 
                        totalFiles: totalToProcess 
                    });
                }
            }
            
            // Add a small delay for Mistral free tier to respect request/second limits even if batch size is 1
            if (selectedProvider === 'mistral') {
                await new Promise(r => setTimeout(r, 200));
            }
        }
    };
    
    // --- Main Pass ---
    await runGenerationLoop(filesToProcess, false);

    // --- Retry Pass ---
    if (retryQueue.length > 0 && !generationStopRef.current) {
        setProgress(prev => ({ ...prev, status: `Retrying ${retryQueue.length} failed files...` }));
        await new Promise(res => setTimeout(res, 2000));
        await runGenerationLoop(retryQueue, true);
    }
    
    if (generationStopRef.current) {
        showToast('Generation stopped.', 'info');
        setProgress(prev => ({...prev, status: 'Stopped.'}));
        return;
    }

    setIsGenerating(false);
    setProgress({ 
        percent: 100, 
        status: `Complete. ${successCount} of ${totalToProcess} successful.`, 
        currentFile: totalToProcess, 
        totalFiles: totalToProcess 
    });
    setCompletionStats({ success: successCount, total: totalToProcess });
    setIsCompletionModalOpen(true);
  };
  
  const handleRegenerate = async (index: number) => {
    let activeKeys: string[] = [];
    if (selectedProvider === 'gemini') activeKeys = apiKeys;
    else if (selectedProvider === 'grok') activeKeys = grokApiKeys;
    else activeKeys = mistralApiKeys;

    if (!activeKeys[0]) {
      showToast('API Key Missing.', 'error');
      return;
    }
    const metadataEntry = generatedMetadata[index];
    if (!metadataEntry || !metadataEntry.apiData) {
      showToast('Cannot regenerate. Missing data.', 'error');
      return;
    }

    const generationMode = settings.controls.activeTab;

    try {
      const prompt = createPrompt(settings.controls, generationMode);
      
      const onRetryCallback = (retryDelay: number) => {
        console.log(`Regeneration for ${metadataEntry.filename} failed. Retrying in ${retryDelay}ms...`);
        showToast(`Regeneration failed, retrying...`, 'warning');
      };

      const newMetadata = await callApiWithBackoff(
          selectedProvider,
          activeKeys[0], 
          selectedModel, 
          prompt, 
          metadataEntry.apiData, 
          settings.controls, 
          generationMode, 
          onRetryCallback
      );

      setGeneratedMetadata(prev => prev.map((item, i) => i === index ? { ...item, ...newMetadata, mode: generationMode } : item));
      showToast(`${metadataEntry.filename} regenerated.`, 'success');
    } catch (error: any) {
      console.error(`Failed to regenerate metadata for ${metadataEntry.filename}:`, error);
      showToast(`Regeneration failed: ${error.message}`, 'error');
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
            />
            <ResultsPanel 
              metadata={generatedMetadata}
              setMetadata={setGeneratedMetadata}
              onRegenerate={handleRegenerate}
            />
          </div>
        </div>
      </main>
      <Footer />
      
      <ApiKeyModal 
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        // Gemini
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
        // Grok
        grokApiKeys={grokApiKeys}
        setGrokApiKeys={setGrokApiKeys}
        // Mistral
        mistralApiKeys={mistralApiKeys}
        setMistralApiKeys={setMistralApiKeys}
        // Provider & Model
        selectedProvider={selectedProvider}
        setSelectedProvider={setSelectedProvider}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        // General
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
