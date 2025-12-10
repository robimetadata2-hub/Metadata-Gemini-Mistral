
import React, { useState, useEffect } from 'react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Gemini Props
  apiKeys: string[];
  setApiKeys: React.Dispatch<React.SetStateAction<string[]>>;
  // Grok Props
  grokApiKeys: string[];
  setGrokApiKeys: React.Dispatch<React.SetStateAction<string[]>>;
  // Mistral Props
  mistralApiKeys: string[];
  setMistralApiKeys: React.Dispatch<React.SetStateAction<string[]>>;
  // General Props
  selectedProvider: 'gemini' | 'grok' | 'mistral';
  setSelectedProvider: React.Dispatch<React.SetStateAction<'gemini' | 'grok' | 'mistral'>>;
  selectedModel: string;
  setSelectedModel: React.Dispatch<React.SetStateAction<string>>;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  themeColor: string;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ 
  isOpen, onClose, 
  apiKeys, setApiKeys, 
  grokApiKeys, setGrokApiKeys,
  mistralApiKeys, setMistralApiKeys,
  selectedProvider, setSelectedProvider,
  selectedModel, setSelectedModel, 
  showToast, themeColor 
}) => {
  const [newApiKey, setNewApiKey] = useState('');
  const [localSelectedModel, setLocalSelectedModel] = useState(selectedModel);
  const [visibleKeys, setVisibleKeys] = useState<Record<number, boolean>>({});

  // Reset local state when modal opens or provider changes
  useEffect(() => {
    if (isOpen) {
      setLocalSelectedModel(selectedModel);
      setVisibleKeys({});
      setNewApiKey('');
    }
  }, [isOpen, selectedModel, selectedProvider]);

  // Handle Provider Change
  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newProvider = e.target.value as 'gemini' | 'grok' | 'mistral';
      setSelectedProvider(newProvider);
      localStorage.setItem('aiProvider', newProvider);
      
      // Set default model for the new provider if needed
      if (newProvider === 'gemini') {
          setLocalSelectedModel('gemini-2.5-flash');
          setSelectedModel('gemini-2.5-flash');
      } else if (newProvider === 'grok') {
          setLocalSelectedModel('grok-2-vision-1212');
          setSelectedModel('grok-2-vision-1212');
      } else {
          setLocalSelectedModel('pixtral-12b-2409');
          setSelectedModel('pixtral-12b-2409');
      }
      setVisibleKeys({});
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const model = e.target.value;
      setLocalSelectedModel(model);
      setSelectedModel(model);
      let storageKey = 'geminiModel';
      if (selectedProvider === 'grok') storageKey = 'grokModel';
      if (selectedProvider === 'mistral') storageKey = 'mistralModel';
      localStorage.setItem(storageKey, model);
  };
  
  if (!isOpen) return null;

  let currentApiKeys: string[] = [];
  let setCurrentApiKeys: React.Dispatch<React.SetStateAction<string[]>>;
  let storageKey = '';
  let providerLabel = '';

  if (selectedProvider === 'gemini') {
      currentApiKeys = apiKeys;
      setCurrentApiKeys = setApiKeys;
      storageKey = 'geminiApiKeys';
      providerLabel = 'Gemini';
  } else if (selectedProvider === 'grok') {
      currentApiKeys = grokApiKeys;
      setCurrentApiKeys = setGrokApiKeys;
      storageKey = 'grokApiKeys';
      providerLabel = 'Grok';
  } else {
      currentApiKeys = mistralApiKeys;
      setCurrentApiKeys = setMistralApiKeys;
      storageKey = 'mistralApiKeys';
      providerLabel = 'Mistral';
  }

  const handleSaveNewKey = () => {
    if (!newApiKey.trim()) {
        showToast('Please enter an API key.', 'warning');
        return;
    }
    if (currentApiKeys.includes(newApiKey.trim())) {
      showToast('API Key already exists.', 'warning');
      return;
    }
    const updatedKeys = [...currentApiKeys, newApiKey.trim()];
    setCurrentApiKeys(updatedKeys);
    localStorage.setItem(storageKey, JSON.stringify(updatedKeys));
    setNewApiKey('');
    showToast(`${providerLabel} API Key saved.`, 'success');
  };

  const handleDelete = (index: number) => {
    const updatedKeys = currentApiKeys.filter((_, i) => i !== index);
    setCurrentApiKeys(updatedKeys);
    localStorage.setItem(storageKey, JSON.stringify(updatedKeys));
    showToast('API Key deleted.', 'success');
  };

  const toggleKeyVisibility = (index: number) => {
    setVisibleKeys(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const lightenDarkenColor = (col: string, amt: number) => {
    let usePound = false;
    if (col[0] === "#") {
        col = col.slice(1);
        usePound = true;
    }
    const num = parseInt(col, 16);
    let r = (num >> 16) + amt;
    if (r > 255) r = 255; else if (r < 0) r = 0;
    let b = ((num >> 8) & 0x00FF) + amt;
    if (b > 255) b = 255; else if (b < 0) b = 0;
    let g = (num & 0x0000FF) + amt;
    if (g > 255) g = 255; else if (g < 0) g = 0;
    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="w-full max-w-md bg-[#202123] rounded-xl border border-gray-700/80 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-700/80">
          <h2 className="text-lg font-semibold text-white">Manage AI Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Provider Selection */}
          <div>
            <label htmlFor="provider-select" className="block text-sm font-medium text-gray-300 mb-2">AI Provider</label>
            <select
              id="provider-select"
              value={selectedProvider}
              onChange={handleProviderChange}
              className="bg-[#2c2d2f] border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
            >
              <option value="gemini">Google Gemini</option>
              <option value="grok">xAI Grok</option>
              <option value="mistral">Mistral AI</option>
            </select>
          </div>

          {/* Model Selection */}
          <div>
            <label htmlFor="model-select" className="block text-sm font-medium text-gray-300 mb-2">Select Model</label>
            <select
              id="model-select"
              value={localSelectedModel}
              onChange={handleModelChange}
              className="bg-[#2c2d2f] border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
            >
              {selectedProvider === 'gemini' ? (
                <>
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                  <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
                  <option value="gemini-robotics-er-1.5-preview">gemini-robotics-er-1.5-preview</option>
                </>
              ) : selectedProvider === 'grok' ? (
                <>
                  <option value="grok-2-vision-1212">grok-2-vision-1212</option>
                  <option value="grok-4-latest">grok-4-latest</option>
                  <option value="grok-4-1-fast">grok-4-1-fast</option>
                  <option value="grok-4-1-fast-reasoning-latest">grok-4-1-fast-reasoning-latest</option>
                </>
              ) : (
                <>
                  <option value="pixtral-12b-2409">pixtral-12b-2409 (Vision - Images)</option>
                  <option value="open-mistral-nemo">open-mistral-nemo (Text Only)</option>
                  <option value="mistral-large-latest">mistral-large-latest (Premium)</option>
                  <option value="mistral-medium-latest">mistral-medium-latest (Premium)</option>
                  <option value="mistral-small-latest">mistral-small-latest (Premium)</option>
                </>
              )}
            </select>
          </div>

          {/* API Key Management */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
                Saved {providerLabel} API Keys
            </label>
            <div className="max-h-36 overflow-y-auto space-y-2 pr-2">
              {currentApiKeys.length === 0 ? (
                <div className="flex items-center justify-center p-3 bg-[#2c2d2f] rounded-md">
                  <p className="text-sm text-gray-500">No {providerLabel} keys saved.</p>
                </div>
              ) : (
                currentApiKeys.map((key, index) => (
                  <div key={index} className="flex justify-between items-center p-2 pl-4 bg-[#2c2d2f] rounded-md">
                    <span className="text-sm text-gray-300 font-mono flex-grow overflow-hidden overflow-ellipsis whitespace-nowrap pr-2">
                      {visibleKeys[index] ? key : `••••••••••••••••••••••••••••••${key.slice(-6)}`}
                    </span>
                    <div className="flex items-center space-x-3 flex-shrink-0">
                        <button onClick={() => toggleKeyVisibility(index)} className="text-gray-400 hover:text-white" title={visibleKeys[index] ? 'Hide key' : 'Show key'}>
                            <i className={`bi ${visibleKeys[index] ? 'bi-eye-slash-fill' : 'bi-eye-fill'}`}></i>
                        </button>
                        <button onClick={() => handleDelete(index)} className="text-red-500 hover:text-red-400" title="Delete key">
                            <i className="bi bi-trash-fill"></i>
                        </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <label htmlFor="new-api-key-input" className="block text-sm font-medium text-gray-300 mb-2">
                Enter new {providerLabel} API key
            </label>
            <div className="flex space-x-3">
              <input
                type="password"
                id="new-api-key-input"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                className="bg-[#2c2d2f] border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                placeholder={`Enter ${providerLabel} API key`}
              />
              <button 
                onClick={handleSaveNewKey} 
                className="py-2.5 px-6 text-white font-medium rounded-lg shadow-md transition-colors"
                style={{ backgroundColor: themeColor, '--hover-color': lightenDarkenColor(themeColor, -20) } as React.CSSProperties}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = e.currentTarget.style.getPropertyValue('--hover-color')}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = themeColor}
              >
                Save
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t border-gray-700/80">
            {selectedProvider === 'gemini' && (
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-full p-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold text-white transition-colors">
                    <i className="bi bi-key-fill mr-2.5"></i>Get Gemini API Key
                </a>
            )}
            {selectedProvider === 'grok' && (
                <a href="https://console.x.ai/" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-full p-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold text-white transition-colors">
                    <i className="bi bi-key-fill mr-2.5"></i>Get xAI API Key
                </a>
            )}
            {selectedProvider === 'mistral' && (
                <a href="https://console.mistral.ai/api-keys/" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-full p-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-semibold text-white transition-colors">
                    <i className="bi bi-key-fill mr-2.5"></i>Get Mistral API Key
                </a>
            )}
        </div>
      </div>
    </div>
  );
};
