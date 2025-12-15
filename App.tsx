
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
import { LoginModal } from './components/modals/LoginModal';
import { Toast } from './components/Toast';
import { StagedFile, GeneratedMetadata, Settings, ToastInfo, ControlSettings } from './types';
import { callApiWithBackoff, createPrompt } from './services/geminiService';
import { DEFAULT_SETTINGS, REQUEST_PER_MINUTE, BATCH_SIZE } from './constants';
import { supabase } from './supabaseClient';

const App: React.FC = () => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [generatedMetadata, setGeneratedMetadata] = useState<GeneratedMetadata[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const generationStopRef = useRef(false);
  
  // Refs to track latest state for async operations
  const generatedMetadataRef = useRef(generatedMetadata);
  const settingsRef = useRef(settings);

  useEffect(() => {
    generatedMetadataRef.current = generatedMetadata;
    settingsRef.current = settings;
  }, [generatedMetadata, settings]);
  
  // Auth & Provider State
  const [selectedProvider, setSelectedProvider] = useState<'gemini' | 'grok' | 'mistral' | 'groq'>('gemini');
  const [apiKeys, setApiKeys] = useState<string[]>([]); // Gemini Keys
  const [grokApiKeys, setGrokApiKeys] = useState<string[]>([]); // Grok (xAI) Keys
  const [mistralApiKeys, setMistralApiKeys] = useState<string[]>([]); // Mistral Keys
  const [groqCloudApiKeys, setGroqCloudApiKeys] = useState<string[]>([]); // Groq Cloud Keys
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  
  const [progress, setProgress] = useState({ percent: 0, status: 'Ready.', currentFile: 0, totalFiles: 0 });
  
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [isTutorialModalOpen, setIsTutorialModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  
  // Supabase User State
  const [user, setUser] = useState<any>(null);

  const [completionStats, setCompletionStats] = useState({ success: 0, total: 0 });
  
  const [toast, setToast] = useState<ToastInfo | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ id: Date.now(), message, type });
  }, []);
  
  // Effect for initializing and loading data from localStorage
  useEffect(() => {
    // Check Supabase Auth Session with Error Handling
    const initAuth = async () => {
        try {
            const { data, error } = await supabase.auth.getSession();
            if (error) {
                console.warn("Supabase Auth Error (Check your keys):", error.message);
            } else {
                setUser(data.session?.user ?? null);
            }
        } catch (err) {
            console.warn("Failed to initialize Supabase:", err);
        }
    };
    initAuth();

    // Subscribe to Auth Changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
    });

    // Load Provider
    const storedProvider = localStorage.getItem('aiProvider');
    if (storedProvider === 'gemini' || storedProvider === 'grok' || storedProvider === 'mistral' || storedProvider === 'groq') {
        setSelectedProvider(storedProvider as any);
        
        // Load appropriate model for provider
        if (storedProvider === 'gemini') {
            const storedModel = localStorage.getItem('geminiModel');
            if (storedModel) setSelectedModel(storedModel);
            else setSelectedModel('gemini-2.5-flash');
        } else if (storedProvider === 'grok') {
            const storedModel = localStorage.getItem('grokModel');
            if (storedModel) setSelectedModel(storedModel);
            else setSelectedModel('grok-2-vision-1212');
        } else if (storedProvider === 'mistral') {
            const storedModel = localStorage.getItem('mistralModel');
            if (storedModel) setSelectedModel(storedModel);
            else setSelectedModel('pixtral-12b-2409');
        } else if (storedProvider === 'groq') {
            const storedModel = localStorage.getItem('groqModel');
            if (storedModel) setSelectedModel(storedModel);
            else setSelectedModel('meta-llama/llama-4-maverick-17b');
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
    
    // Load Groq Cloud Keys
    try {
      const storedGroqKeys = localStorage.getItem('groqCloudApiKeys');
      if (storedGroqKeys) setGroqCloudApiKeys(JSON.parse(storedGroqKeys));
    } catch (e) { console.error("Failed to parse Groq Cloud API keys", e); }

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
    
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    try {
        await supabase.auth.signOut();
        setUser(null);
        showToast('Logged out successfully', 'info');
    } catch (error) {
        console.error("Logout error:", error);
    }
  };

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

  // Export CSV Function
  const handleExportCsv = () => {
    // Use Refs to access latest state even inside closures
    const currentMetadata = generatedMetadataRef.current;
    const currentSettings = settingsRef.current;

    if (currentMetadata.length === 0) {
        showToast('No metadata available to export.', 'warning');
        return;
    }

    const escapeCsv = (str: string | undefined | number) => `"${(String(str ?? '').replace(/"/g, '""'))}"`;
    const getFilenameWithNewExtension = (originalFilename: string) => {
        if (currentSettings.fileExtension === 'default' || !currentSettings.fileExtension) {
            return originalFilename;
        }
        const lastDotIndex = originalFilename.lastIndexOf('.');
        if (lastDotIndex === -1) {
            return `${originalFilename}.${currentSettings.fileExtension}`;
        }
        const nameWithoutExtension = originalFilename.substring(0, lastDotIndex);
        return `${nameWithoutExtension}.${currentSettings.fileExtension}`;
    };

    let csvContent = "";
    const generationMode = currentMetadata.length > 0 ? currentMetadata[0].mode : 'metadata';
    
    if (generationMode === 'prompt') {
        const headers = ['serial number', 'Description'];
        const rows = currentMetadata
            .filter(item => item.mode === 'prompt')
            .map((item, index) => 
                [
                    index + 1,
                    item.description
                ].map(escapeCsv).join(',')
            );
        csvContent = headers.join(',') + '\n' + rows.join('\n');
    } else {
        let headers: string[] = [];
        let rows: string[] = [];
        const metadataItems = currentMetadata.filter(item => item.mode === 'metadata');

        switch (currentSettings.selectedStockSite) {
            case 'adobe-stock':
                headers = ['Filename', 'Title', 'Keywords', 'Category'];
                rows = metadataItems.map(r => 
                    [
                        getFilenameWithNewExtension(r.filename),
                        r.title,
                        r.keywords?.join(', '),
                        r.category,
                    ].map(escapeCsv).join(',')
                );
                break;
            case 'shutterstock':
                headers = ['Filename', 'Description', 'Keywords', 'Categorie'];
                rows = metadataItems.map(r => 
                    [
                        getFilenameWithNewExtension(r.filename),
                        r.title, 
                        r.keywords?.slice(0, 50).join(','),
                        r.category,
                    ].map(escapeCsv).join(',')
                );
                break;
            case 'freepik':
                headers = ['File name', 'Title', 'Keywords', 'Prompt', 'Category'];
                rows = metadataItems.map(r => 
                    [
                        getFilenameWithNewExtension(r.filename),
                        r.title,
                        r.keywords?.join(', '),
                        "", 
                        r.category,
                    ].map(escapeCsv).join(',')
                );
                break;
            case 'getty':
                headers = ['Filename', 'Title', 'Description', 'Keywords', 'Category'];
                rows = metadataItems.map(r => 
                    [
                        getFilenameWithNewExtension(r.filename),
                        r.title,
                        r.description,
                        r.keywords?.join(', '),
                        r.category,
                    ].map(escapeCsv).join(',')
                );
                break;
            case 'istock':
                headers = ['filename', 'title', 'keywords', 'category', 'release'];
                rows = metadataItems.map(r => 
                    [
                        getFilenameWithNewExtension(r.filename),
                        r.title,
                        r.keywords?.join(', '),
                        r.category,
                        "",
                    ].map(escapeCsv).join(',')
                );
                break;
            case 'dreamstime':
                headers = ['filename', 'title', 'keywords', 'category', 'exclusive', 'editorial', 'model_releases', 'property_releases', 'image_id', 'mr_ids'];
                rows = metadataItems.map(r => 
                    [
                        getFilenameWithNewExtension(r.filename),
                        r.title,
                        r.keywords?.join(', '),
                        r.category,
                        "","","","","","",
                    ].map(escapeCsv).join(',')
                );
                break;
            case 'vecteezy':
                headers = ['Filename', 'Title', 'Description', 'Keywords'];
                rows = metadataItems.map(r => 
                    [
                        getFilenameWithNewExtension(r.filename),
                        r.title,
                        r.description,
                        r.keywords?.join(', '),
                    ].map(escapeCsv).join(',')
                );
                break;
            case 'General':
            default:
                headers = ['Filename', 'Title', 'Description', 'Keywords', 'Category'];
                rows = metadataItems.map(r => 
                    [
                        getFilenameWithNewExtension(r.filename),
                        r.title,
                        r.description,
                        r.keywords?.join(', '),
                        r.category,
                    ].map(escapeCsv).join(',')
                );
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

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
    // Validate Keys based on Provider
    let activeKeys: string[] = [];
    let providerName = '';
    
    if (selectedProvider === 'gemini') {
        activeKeys = apiKeys;
        providerName = 'Google Gemini';
    } else if (selectedProvider === 'grok') {
        activeKeys = grokApiKeys;
        providerName = 'xAI Grok';
    } else if (selectedProvider === 'mistral') {
        activeKeys = mistralApiKeys;
        providerName = 'Mistral AI';
    } else if (selectedProvider === 'groq') {
        activeKeys = groqCloudApiKeys;
        providerName = 'Groq Cloud';
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
        const userBatchSize = settings.controls.batchSize || BATCH_SIZE;
        let batchSize = userBatchSize;
        
        // Removed hardcoded restrictions for Mistral and Groq to respect user settings

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
                setIsGenerating(true); 
            }
            if (generationStopRef.current) break;
            
            const batchFiles = files.slice(i, i + batchSize);
            
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
                    if (isRetryPass) { 
                        console.error(`Failed to generate metadata for ${fileState.file.name} on retry:`, result.error);
                        showToast(`Retry failed for ${fileState.file.name}: ${result.error.message}`, 'error');
                        setGeneratedMetadata(prev => [...prev, {
                            title: 'Error', description: `Failed: ${result.error.message}`, keywords: [], category: 'Error',
                            thumbnailUrl: fileState.thumbnailDataUrl, filename: fileState.file.name, mode: generationMode, apiData: fileState.apiData,
                        }]);
                        setStagedFiles(prev => prev.filter(f => f.id !== fileState.id));
                    } else { 
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
            
            if (selectedProvider !== 'gemini') {
                await new Promise(r => setTimeout(r, 200));
            }
        }
    };
    
    await runGenerationLoop(filesToProcess, false);

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
    
    // Use settingsRef to get the latest value of autoDownloadCsv in case user toggled it during generation
    if (settingsRef.current.controls.autoDownloadCsv && successCount > 0) {
        setTimeout(() => {
            handleExportCsv();
        }, 500);
    }
  };
  
  const handleRegenerate = async (index: number) => {
    let activeKeys: string[] = [];
    if (selectedProvider === 'gemini') activeKeys = apiKeys;
    else if (selectedProvider === 'grok') activeKeys = grokApiKeys;
    else if (selectedProvider === 'mistral') activeKeys = mistralApiKeys;
    else if (selectedProvider === 'groq') activeKeys = groqCloudApiKeys;

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
        user={user}
        onLogout={handleLogout}
        onLogin={() => setIsLoginModalOpen(true)}
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
              user={user}
              onLogin={() => setIsLoginModalOpen(true)}
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
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
        grokApiKeys={grokApiKeys}
        setGrokApiKeys={setGrokApiKeys}
        mistralApiKeys={mistralApiKeys}
        setMistralApiKeys={setMistralApiKeys}
        groqCloudApiKeys={groqCloudApiKeys}
        setGroqCloudApiKeys={setGroqCloudApiKeys}
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
      
      <TutorialModal
        isOpen={isTutorialModalOpen}
        onClose={() => setIsTutorialModalOpen(false)}
      />

      <LoginModal 
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSignIn={() => {}} // Not used with Supabase direct call in component, but required by prop type
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
