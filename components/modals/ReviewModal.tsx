import React from 'react';
import { GeneratedMetadata } from '../../types';

interface ReviewModalProps {
  isOpen: boolean;
  results: GeneratedMetadata[];
  onAccept: () => void;
  onDiscard: () => void;
  themeColor: string;
}

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

// FIX: Added component implementation and export statement. The original file was incomplete.
export const ReviewModal: React.FC<ReviewModalProps> = ({ isOpen, results, onAccept, onDiscard, themeColor }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]">
      <div className="w-full max-w-4xl bg-[#202123] rounded-xl border border-gray-700/80 shadow-2xl flex flex-col mx-4 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-700/80">
          <h2 className="text-lg font-semibold text-white">Review & Confirm ({results.length} items)</h2>
          <button onClick={onDiscard} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        
        <div className="p-6 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {results.map((item, index) => (
            <div key={index} className="flex gap-4 p-3 bg-[#2a2b2e] rounded-lg items-center">
              <img src={item.thumbnailUrl} alt={item.filename} className="w-24 h-24 object-cover rounded-md flex-shrink-0 bg-[#3b3b3e]" />
              <div className="flex-grow min-w-0">
                <p className="text-sm font-medium text-white truncate" title={item.filename}>{item.filename}</p>
                {item.mode === 'metadata' ? (
                    <>
                        {item.title && <p className="text-xs text-gray-300 mt-1 truncate" title={item.title}>{item.title}</p>}
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2" title={item.description}>{item.description}</p>
                    </>
                ) : (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-3" title={item.description}>{item.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        
        <div className="flex justify-end items-center p-5 border-t border-gray-700/80 space-x-4 flex-shrink-0">
          <button 
            onClick={onDiscard} 
            className="py-2 px-5 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg shadow-md transition-colors text-sm"
          >
            Discard
          </button>
          <button 
            onClick={onAccept} 
            className="py-2 px-5 text-white font-medium rounded-lg shadow-md transition-colors text-sm"
            style={{ backgroundColor: themeColor, '--hover-color': lightenDarkenColor(themeColor, -20) } as React.CSSProperties}
            onMouseOver={(e) => {
                const target = e.currentTarget as HTMLButtonElement;
                target.style.backgroundColor = target.style.getPropertyValue('--hover-color');
            }}
            onMouseOut={(e) => {
                const target = e.currentTarget as HTMLButtonElement;
                target.style.backgroundColor = themeColor;
            }}
          >
            Accept & Add to Results
          </button>
        </div>
      </div>
    </div>
  );
};
