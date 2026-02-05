
import React from 'react';
import { GeneratedMetadata } from '../types';

interface ResultsPanelProps {
  metadata: GeneratedMetadata[];
  setMetadata: React.Dispatch<React.SetStateAction<GeneratedMetadata[]>>;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onRegenerate?: (item: GeneratedMetadata) => void;
}

const safeString = (str: any): string => {
    if (typeof str === 'string') return str;
    if (typeof str === 'number') return String(str);
    if (str === null || str === undefined) return '';
    if (typeof str === 'object') {
        return str.summary || str.details || JSON.stringify(str);
    }
    return String(str);
};

const countWords = (str?: string | null | any) => {
    const s = safeString(str);
    if (!s) return 0;
    return s.trim().split(/\s+/).filter(Boolean).length;
};

const CopyButton: React.FC<{ onCopy: () => void, className?: string }> = ({ onCopy, className = '' }) => (
    <button
        onClick={onCopy}
        className={`text-gray-500 hover:text-[color:var(--theme-color)] transition-colors text-sm ${className}`}
        title="Copy to clipboard"
    >
        <i className="bi bi-clipboard-fill"></i>
    </button>
);

export const ResultsPanel: React.FC<ResultsPanelProps> = ({ metadata, setMetadata, showToast, onRegenerate }) => {

  const handleDelete = (filename: string) => {
    setMetadata(prev => prev.filter(item => item.filename !== filename));
    showToast(`${filename} removed.`, 'info');
  };

  const handleCopy = (text: any, fieldName: string) => {
    const str = safeString(text);
    if (!str) {
        showToast(`No ${fieldName.toLowerCase()} to copy.`, 'warning');
        return;
    }
    navigator.clipboard.writeText(str).then(() => {
        showToast(`${fieldName} copied to clipboard!`, 'success');
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        showToast('Failed to copy.', 'error');
    });
  };

  return (
    <div id="results-container" className="panel-bg p-4 sm:p-6 bg-[#202123] border border-[#363636] rounded-xl shadow-lg">
      <h2 className="text-xl font-semibold text-white mb-4">Generated Metadata ({metadata.length})</h2>
      
      {metadata.length === 0 ? (
        <div className="flex items-center justify-center h-48 rounded-lg bg-gray-800/20 border-2 border-dashed border-gray-600">
          <p className="text-gray-500">Results will appear here after generation.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
          {[...metadata].reverse().map((item, index) => (
            <div key={`${item.filename}-${index}`} className="group flex flex-col sm:flex-row items-start gap-4 p-3 bg-[#2a2b2e] rounded-lg transition-colors hover:bg-[#333437]">
              {/* Thumbnail Column with Redo Button */}
              <div className="flex flex-col gap-2 flex-shrink-0 w-24 sm:w-24">
                  <img src={item.thumbnailUrl} alt={item.filename} className="w-24 h-24 object-contain rounded-md bg-[#3b3b3e]" />
                  
                  {item.originalFile && onRegenerate && (
                     <button
                        onClick={() => onRegenerate(item)}
                        className="w-full py-1.5 bg-[#3b3b3e] hover:bg-[color:var(--theme-color)] text-gray-300 hover:text-white text-xs font-medium rounded transition-colors flex items-center justify-center gap-1.5 border border-gray-600 hover:border-[color:var(--theme-color)] shadow-sm"
                        title="Regenerate Metadata"
                     >
                        <i className="bi bi-arrow-repeat text-sm"></i>
                        <span>Redo</span>
                     </button>
                 )}
              </div>

              <div className="flex-grow min-w-0">
                <div className="flex justify-between items-start">
                    <p className="text-sm font-medium text-white truncate pr-2" title={item.filename}>{item.filename}</p>
                    <div className="flex items-center space-x-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            onClick={() => handleDelete(item.filename)} 
                            className="text-gray-500 hover:text-red-500 transition-colors"
                            title="Delete item"
                        >
                            <i className="bi bi-trash-fill text-lg"></i>
                        </button>
                    </div>
                </div>
                
                {item.mode === 'metadata' && (
                  <div className="mt-2 space-y-2">
                    <div>
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-0.5">
                            <span>Title</span>
                            <CopyButton onCopy={() => handleCopy(item.title, 'Title')} />
                        </div>
                        <p className="text-sm text-gray-300 truncate" title={safeString(item.title)}>{safeString(item.title) || 'N/A'}</p>
                    </div>
                     <div>
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-0.5">
                            <span>Description</span>
                            <CopyButton onCopy={() => handleCopy(item.description, 'Description')} />
                        </div>
                        <p className="text-xs text-gray-400 line-clamp-2" title={safeString(item.description)}>{safeString(item.description)}</p>
                    </div>
                     <div>
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-0.5">
                            <span>Keywords</span>
                            <CopyButton onCopy={() => handleCopy(item.keywords?.join(', '), 'Keywords')} />
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2" title={item.keywords?.join(', ')}>
                           {item.keywords?.join(', ') || 'None'}
                        </p>
                    </div>
                  </div>
                )}
                {item.mode === 'prompt' && (
                   <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-gray-400 mb-0.5">
                            <span>Generated Prompt</span>
                            <CopyButton onCopy={() => handleCopy(item.description, 'Prompt')} />
                        </div>
                        <p className="text-xs text-gray-300 mt-1 line-clamp-3" title={safeString(item.description)}>{safeString(item.description)}</p>
                    </div>
                )}

                {/* Counts */}
                <div className="flex items-center gap-3 mt-3 text-xs">
                    {item.mode === 'metadata' && (
                        <span className="bg-gray-700/50 text-gray-300 px-2 py-0.5 rounded">
                           Title: <strong>{countWords(item.title)}</strong> words
                        </span>
                    )}
                    <span className="bg-gray-700/50 text-gray-300 px-2 py-0.5 rounded">
                        Desc: <strong>{countWords(item.description)}</strong> words
                    </span>
                    {item.mode === 'metadata' && (
                         <span className="bg-gray-700/50 text-gray-300 px-2 py-0.5 rounded">
                            Keywords: <strong>{item.keywords?.length || 0}</strong>
                        </span>
                    )}
                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
