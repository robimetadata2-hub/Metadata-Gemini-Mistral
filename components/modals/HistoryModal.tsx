
import React from 'react';
import { HistorySession, GeneratedMetadata } from '../../types';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistorySession[];
  setHistory: React.Dispatch<React.SetStateAction<HistorySession[]>>;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose, history, setHistory, showToast }) => {
  if (!isOpen) return null;

  const handleDeleteSession = (sessionId: string) => {
    setHistory(prev => prev.filter(session => session.id !== sessionId));
    showToast('Session removed from history.', 'info');
  };

  const handleDownloadSessionCsv = (session: HistorySession) => {
    const { metadata, settings } = session;

    if (metadata.length === 0) {
        showToast('This session has no metadata to export.', 'warning');
        return;
    }

    const escapeCsv = (str: string | undefined | number) => `"${(String(str ?? '').replace(/"/g, '""'))}"`;
    const getFilenameWithNewExtension = (originalFilename: string) => {
        if (settings.fileExtension === 'default' || !settings.fileExtension) {
            return originalFilename;
        }
        const lastDotIndex = originalFilename.lastIndexOf('.');
        if (lastDotIndex === -1) return `${originalFilename}.${settings.fileExtension}`;
        const nameWithoutExtension = originalFilename.substring(0, lastDotIndex);
        return `${nameWithoutExtension}.${settings.fileExtension}`;
    };

    let csvContent = "";
    const generationMode = metadata[0].mode;

    if (generationMode === 'prompt') {
        const headers = ['serial number', 'Description'];
        const rows = metadata.map((item, index) => [index + 1, item.description].map(escapeCsv).join(','));
        csvContent = headers.join(',') + '\n' + rows.join('\n');
    } else {
        let headers: string[] = [];
        let rows: string[] = [];
        switch (settings.selectedStockSite) {
            case 'adobe-stock':
                headers = ['Filename', 'Title', 'Keywords', 'Category'];
                rows = metadata.map(r => [getFilenameWithNewExtension(r.filename), r.title, r.keywords?.join(', '), r.category].map(escapeCsv).join(','));
                break;
            case 'shutterstock':
                 headers = ['Filename', 'Description', 'Keywords', 'Categorie'];
                 rows = metadata.map(r => [getFilenameWithNewExtension(r.filename), r.title, r.keywords?.slice(0, 50).join(','), r.category].map(escapeCsv).join(','));
                 break;
            default:
                headers = ['Filename', 'Title', 'Description', 'Keywords', 'Category'];
                rows = metadata.map(r => [getFilenameWithNewExtension(r.filename), r.title, r.description, r.keywords?.join(', '), r.category].map(escapeCsv).join(','));
                break;
        }
        if (rows.length > 0) {
            csvContent = headers.join(',') + '\n' + rows.join('\n');
        }
    }
    
    if (!csvContent.trim()) {
        showToast('No data to export for this session.', 'warning');
        return;
    }

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const date = new Date(session.timestamp).toLocaleDateString('en-CA'); // YYYY-MM-DD
    const filename = `${date}_${settings.selectedStockSite}_${generationMode}.csv`;
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV for session downloaded.', 'success');
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="w-full max-w-3xl h-[80vh] bg-[#202123] rounded-xl border border-gray-700/80 shadow-2xl flex flex-col mx-4 my-8" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-700/80 flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">Generation History ({history.length} sessions)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        
        <div className="p-6 space-y-4 flex-grow overflow-y-auto">
          {history.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">No saved history. Generate some metadata to see sessions here.</p>
            </div>
          ) : (
            <div className="w-full">
              <table className="w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-300 uppercase bg-[#2a2b2e] sticky top-0">
                  <tr>
                    <th scope="col" className="px-4 py-3">Date & Time</th>
                    <th scope="col" className="px-4 py-3 text-center">Items</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((session) => (
                    <tr key={session.id} className="border-b border-gray-700 hover:bg-[#2a2b2e]/50">
                      <td className="px-4 py-3 font-medium text-gray-200">
                        {new Date(session.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-center">{session.itemCount}</td>
                      <td className="px-4 py-3 text-right space-x-3">
                        <button onClick={() => handleDownloadSessionCsv(session)} className="text-green-500 hover:text-green-400 text-lg" title="Download CSV">
                          <i className="bi bi-download"></i>
                        </button>
                        <button onClick={() => handleDeleteSession(session.id)} className="text-red-500 hover:text-red-400 text-lg" title="Delete Session">
                          <i className="bi bi-trash-fill"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        <div className="flex justify-end items-center p-5 border-t border-gray-700/80 flex-shrink-0">
          <button 
            onClick={onClose} 
            className="py-2 px-5 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg shadow-md transition-colors text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
