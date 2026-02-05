
import React, { useState, useEffect } from 'react';
import { testApiKey } from '../../services/geminiService';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  mistralApiKeys: string[];
  setMistralApiKeys: React.Dispatch<React.SetStateAction<string[]>>;
  groqCloudApiKeys: string[];
  setGroqCloudApiKeys: React.Dispatch<React.SetStateAction<string[]>>;
  geminiApiKeys: string[];
  setGeminiApiKeys: React.Dispatch<React.SetStateAction<string[]>>;
  selectedProvider: 'mistral' | 'groq' | 'gemini';
  setSelectedProvider: (provider: 'mistral' | 'groq' | 'gemini') => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  themeColor: string;
}

const PROVIDER_CONFIG = {
    mistral: {
        name: "Mistral AI",
        keyLink: "https://console.mistral.ai/api-keys/",
        models: [
            { id: 'pixtral-12b-2409', name: 'Pixtral 12B (Vision)' },
        ]
    },
    groq: {
        name: "Groq Cloud",
        keyLink: "https://console.groq.com/keys",
        models: [
            { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout Fast' },
            { id: 'llama-3.2-90b-vision-preview', name: 'Llama 4 Maverick HQ' },
        ]
    },
    gemini: {
        name: "Google Gemini",
        keyLink: "https://aistudio.google.com/app/apikey",
        models: [
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
            { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image' },
        ]
    }
};

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ 
  isOpen, onClose, 
  mistralApiKeys, setMistralApiKeys,
  groqCloudApiKeys, setGroqCloudApiKeys,
  geminiApiKeys, setGeminiApiKeys,
  selectedProvider, setSelectedProvider,
  selectedModel, setSelectedModel,
  showToast, themeColor 
}) => {
  const [newApiKey, setNewApiKey] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Record<number, boolean>>({});
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVisibleKeys({});
      setNewApiKey('');
    }
  }, [isOpen]);

  const handleProviderChange = (provider: 'mistral' | 'groq' | 'gemini') => {
      setSelectedProvider(provider);
      // Set to the first available model for the new provider if valid
      if (PROVIDER_CONFIG[provider].models.length > 0) {
          setSelectedModel(PROVIDER_CONFIG[provider].models[0].id);
      }
      localStorage.setItem('aiProvider', provider);
  };
  
  if (!isOpen) return null;

  const currentKeys = selectedProvider === 'mistral' ? mistralApiKeys : selectedProvider === 'groq' ? groqCloudApiKeys : geminiApiKeys;
  const setKeys = selectedProvider === 'mistral' ? setMistralApiKeys : selectedProvider === 'groq' ? setGroqCloudApiKeys : setGeminiApiKeys;
  const storageKey = selectedProvider === 'mistral' ? 'mistralApiKeys' : selectedProvider === 'groq' ? 'groqCloudApiKeys' : 'geminiApiKeys';

  const handleSaveNewKey = () => {
    if (!newApiKey.trim()) {
        showToast('Please enter an API key.', 'warning');
        return;
    }
    if (currentKeys.includes(newApiKey.trim())) {
      showToast('API Key already exists.', 'warning');
      return;
    }
    const updatedKeys = [...currentKeys, newApiKey.trim()];
    setKeys(updatedKeys as any);
    localStorage.setItem(storageKey, JSON.stringify(updatedKeys));
    setNewApiKey('');
    showToast(`${PROVIDER_CONFIG[selectedProvider].name} API Key saved.`, 'success');
  };
  
  const handleTestKey = async () => {
    const keyToTest = newApiKey.trim();
    if (!keyToTest) {
        showToast('Please enter an API key to test.', 'warning');
        return;
    }
    
    setIsTesting(true);
    const result = await testApiKey(selectedProvider, keyToTest, selectedModel);
    setIsTesting(false);
    
    if (result.success) {
        showToast(result.message, 'success');
    } else {
        showToast(result.message, 'error');
    }
  };

  const handleDelete = (index: number) => {
    const updatedKeys = currentKeys.filter((_, i) => i !== index);
    setKeys(updatedKeys as any);
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
      <div className="w-full max-w-lg bg-[#202123] rounded-xl border border-gray-700/80 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-700/80">
          <h2 className="text-lg font-semibold text-white">Manage AI Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        
        <div className="p-6 space-y-6">
            {/* Provider Tabs */}
            <div className="flex space-x-2 p-1 bg-[#2c2d2f] rounded-lg">
                {(Object.keys(PROVIDER_CONFIG) as Array<'mistral' | 'groq' | 'gemini'>).map(provider => (
                    <button
                        key={provider}
                        onClick={() => handleProviderChange(provider)}
                        className={`w-full py-2 px-4 rounded-md text-sm font-semibold transition-colors ${selectedProvider === provider ? 'bg-gray-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                    >
                        {PROVIDER_CONFIG[provider].name}
                    </button>
                ))}
            </div>

            {/* Model Selection */}
            <div>
                <label htmlFor="model-select" className="block text-sm font-medium text-gray-300 mb-2">
                    Select Model ({PROVIDER_CONFIG[selectedProvider].name})
                </label>
                <select
                    id="model-select"
                    value={selectedModel}
                    onChange={(e) => {
                        setSelectedModel(e.target.value);
                        localStorage.setItem(`${selectedProvider}Model`, e.target.value);
                    }}
                    className="bg-[#2c2d2f] border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                >
                    {PROVIDER_CONFIG[selectedProvider].models.map(model => (
                        <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                </select>
            </div>

            {/* API Key Management */}
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                    Saved {PROVIDER_CONFIG[selectedProvider].name} API Keys
                </label>
                <div className="max-h-36 overflow-y-auto space-y-2 pr-2">
                    {currentKeys.length === 0 ? (
                        <div className="flex items-center justify-center p-3 bg-[#2c2d2f] rounded-md">
                        <p className="text-sm text-gray-500">No {PROVIDER_CONFIG[selectedProvider].name} keys saved.</p>
                        </div>
                    ) : (
                        currentKeys.map((key, index) => (
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
                    Enter new {PROVIDER_CONFIG[selectedProvider].name} API key
                </label>
                <div className="flex items-center space-x-2">
                <input
                    type="password"
                    id="new-api-key-input"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    className="bg-[#2c2d2f] border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    placeholder={`Enter ${PROVIDER_CONFIG[selectedProvider].name} API key`}
                />
                <button
                    onClick={handleTestKey}
                    disabled={isTesting || !newApiKey.trim()}
                    className="py-2.5 px-4 text-gray-900 bg-gray-300 hover:bg-gray-400 font-medium rounded-lg shadow-md transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    title="Test the key in the input box"
                >
                    {isTesting ? <div className="spinner-sm border-t-gray-800"></div> : 'Test'}
                </button>
                <button 
                    onClick={handleSaveNewKey} 
                    className="py-2.5 px-5 text-white font-medium rounded-lg shadow-md transition-colors flex-shrink-0 text-sm"
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
            <a href={PROVIDER_CONFIG[selectedProvider].keyLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-full p-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-semibold text-white transition-colors">
                <i className="bi bi-key-fill mr-2.5"></i>Get {PROVIDER_CONFIG[selectedProvider].name} API Key
            </a>
        </div>
      </div>
    </div>
  );
};
