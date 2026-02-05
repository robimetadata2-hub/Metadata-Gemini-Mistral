
import { StagedFile } from '../types';

const createImageFromFile = (file: File | Blob): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = (error) => {
            URL.revokeObjectURL(url);
            reject(error);
        };
        img.src = url;
    });
};

// Helper to get Blob from data URL to check size
const dataURLtoBlob = (dataurl: string): Blob => {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error('Could not parse MIME type');
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
};

// Iteratively compresses an image to be under a target size in bytes.
const compressImageToTarget = async (
    image: HTMLImageElement, 
    targetBytes: number,
    outputMimeType: 'image/png' | 'image/jpeg'
): Promise<string> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get canvas context");

    let { width, height } = image;

    // Start with a reasonable max width
    const initialMaxWidth = 256; // Reduced for faster processing
    if (width > initialMaxWidth) {
        height = (initialMaxWidth / width) * height;
        width = initialMaxWidth;
    }
    
    canvas.width = width;
    canvas.height = height;
    
    // Only fill background for JPEG, not for PNG
    if (outputMimeType === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
    }
    
    ctx.drawImage(image, 0, 0, width, height);
    
    let quality = 0.7; // Reduced starting quality
    let dataUrl = canvas.toDataURL(outputMimeType, quality);
    let blob = dataURLtoBlob(dataUrl);

    // First pass: reduce quality
    while (blob.size > targetBytes && quality > 0.1) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL(outputMimeType, quality);
        blob = dataURLtoBlob(dataUrl);
    }

    // Second pass if needed: reduce dimensions
    while (blob.size > targetBytes && width > 128) {
        // Reduce dimensions by 20%
        width *= 0.8;
        height *= 0.8;
        canvas.width = width;
        canvas.height = height;
        
        if (outputMimeType === 'image/jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(image, 0, 0, width, height);

        // Reset quality slightly and reduce again
        quality = 0.7;
        dataUrl = canvas.toDataURL(outputMimeType, quality);
        blob = dataURLtoBlob(dataUrl);
        while (blob.size > targetBytes && quality > 0.1) {
             quality -= 0.1;
             dataUrl = canvas.toDataURL(outputMimeType, quality);
             blob = dataURLtoBlob(dataUrl);
        }
    }
    
    return dataUrl;
};

// This function is for THUMBNAILS and uses fixed settings.
const compressImage = async (
    file: File | Blob, 
    maxWidth: number, 
    quality: number,
    outputMimeType: 'image/png' | 'image/jpeg' = 'image/jpeg'
): Promise<string> => {
    const image = await createImageFromFile(file);
    const canvas = document.createElement('canvas');
    let { width, height } = image;
    
    if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
    }
    
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get canvas context");

    if (outputMimeType === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(image, 0, 0, width, height);
    
    return canvas.toDataURL(outputMimeType, quality);
};

const getVideoFrame = (file: File, maxWidth: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        const url = URL.createObjectURL(file);

        video.onloadeddata = () => {
            video.currentTime = Math.min(1.0, video.duration / 2); // Seek to middle or 1s
        };

        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            let { videoWidth, videoHeight } = video;
            
            if (videoWidth > maxWidth) {
                videoHeight = (maxWidth / videoWidth) * videoHeight;
                videoWidth = maxWidth;
            }

            canvas.width = videoWidth;
            canvas.height = videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error("Could not get canvas context"));

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, videoWidth, videoHeight);
            ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
            URL.revokeObjectURL(url);
            resolve(dataUrl);
        };

        video.onerror = (error) => {
            URL.revokeObjectURL(url);
            reject(error);
        };

        video.src = url;
    });
};

export const generateThumbnail = async (file: File): Promise<string> => {
    const maxWidth = 150; // Reduced for faster thumbnail generation
    const thumbnailQuality = 0.4; // Reduced quality for faster thumbnail generation
    
    const isPngOrSvg = file.type === 'image/png' || file.type === 'image/svg+xml';
    const outputMimeType = isPngOrSvg ? 'image/png' : 'image/jpeg';
    
    if (/^image\/(jpeg|png|gif)$/.test(file.type)) {
        return await compressImage(file, maxWidth, thumbnailQuality, outputMimeType); 
    }
    if (file.type === 'image/svg+xml') {
        const blob = new Blob([await file.text()], { type: 'image/svg+xml;charset=utf-8' });
        return await compressImage(new File([blob], file.name, {type: "image/svg+xml"}), maxWidth, thumbnailQuality, 'image/png');
    }
    if (file.type.startsWith('video/')) {
        return await getVideoFrame(file, maxWidth);
    }
    if (file.type === 'application/postscript' || file.type === 'application/pdf') {
        const ext = file.name.split('.').pop()?.toUpperCase() || 'Vector';
        return `https://placehold.co/300x300/ffffff/333333?text=${ext}`;
    }
    throw new Error("Unsupported file type for thumbnail generation.");
};

export const processFileForApi = async (fileState: StagedFile): Promise<{ base64Data: string; mimeType: string; }> => {
    const targetBytes = 10 * 1024; // 10KB Target - Reduced for extreme speed
    const file = fileState.file;
    let dataUrl: string;

    const isInputPngOrSvg = file.type === 'image/png' || file.type === 'image/svg+xml';
    let outputMimeType: 'image/png' | 'image/jpeg' = isInputPngOrSvg ? 'image/png' : 'image/jpeg';

    const processAnyImage = async (inputFile: File | Blob) => {
        const image = await createImageFromFile(inputFile);
        return await compressImageToTarget(image, targetBytes, outputMimeType);
    };

    if (/^image\/(jpeg|png|gif|svg\+xml)$/.test(file.type)) {
        const blob = file.type === 'image/svg+xml' ? new Blob([await file.text()], { type: 'image/svg+xml;charset=utf-8' }) : file;
        dataUrl = await processAnyImage(blob);
    } else if (file.type.startsWith('video/')) {
        outputMimeType = 'image/jpeg'; // Video frames are always JPEG
        const frameDataUrl = await getVideoFrame(file, 512); 
        const frameBlob = dataURLtoBlob(frameDataUrl);
        if (frameBlob.size > targetBytes) {
            dataUrl = await processAnyImage(frameBlob);
        } else {
            dataUrl = frameDataUrl;
        }
    } else if (file.type === 'application/postscript' || file.type === 'application/pdf') {
        outputMimeType = 'image/jpeg'; // Placeholder is JPEG
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not create canvas context for placeholder.");
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 100, 100);
        ctx.fillStyle = '#333333';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Vector File', 50, 50);
        dataUrl = canvas.toDataURL('image/jpeg', 0.5);
    } else {
        throw new Error("Unsupported file type for API processing.");
    }
    
    const base64Data = dataUrl.split(',')[1];
    if (!base64Data) throw new Error("Failed to extract base64 data from data URL.");
    
    return { base64Data, mimeType: outputMimeType };
};
