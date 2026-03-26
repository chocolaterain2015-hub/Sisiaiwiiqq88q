import React, { useState, useEffect, useRef } from 'react';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

import { 
  Sparkles, 
  Settings, 
  History, 
  Eye, 
  EyeOff, 
  Download, 
  Trash2, 
  AlertCircle,
  Loader2,
  ShieldAlert,
  Smartphone,
  Info,
  Maximize,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  Link as LinkIcon,
  Wand2,
  Save,
  Copy,
  ArrowUpCircle,
  MessageSquare,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateImage, enhancePrompt, suggestRefinedPrompt, startChat } from './lib/gemini.ts';
import { safeStorage } from './lib/storage.ts';

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
  isMature: boolean;
  aspectRatio: string;
  style: string;
  references?: string[];
  seed?: number;
}

interface Template {
  id: string;
  name: string;
  prompt: string;
  negativePrompt?: string;
  style: string;
  aspectRatio: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

const STYLES = [
  { id: 'none', label: 'None', icon: '✨' },
  { id: 'anime', label: 'Anime', icon: '⛩️' },
  { id: 'realistic', label: 'Realistic', icon: '📸' },
  { id: 'cartoon', label: 'Cartoon', icon: '🎨' },
  { id: 'cyberpunk', label: 'Cyberpunk', icon: '🌃' },
  { id: 'digital_art', label: 'Digital Art', icon: '🖌️' },
  { id: 'sketch', label: 'Sketch', icon: '✏️' },
  { id: 'oil_painting', label: 'Oil Painting', icon: '🖼️' },
];

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1', icon: 'Square' },
  { id: '16:9', label: '16:9', icon: 'Landscape' },
  { id: '9:16', label: '9:16', icon: 'Portrait' },
  { id: '4:3', label: '4:3', icon: 'Standard' },
  { id: '3:4', label: '3:4', icon: 'Classic' },
];

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentImage, setCurrentImage] = useState<GeneratedImage | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const [matureMode, setMatureMode] = useState(false);
  const [isBlurred, setIsBlurred] = useState(true);
  const [credits, setCredits] = useState(50);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'generate' | 'gallery' | 'assistant' | 'settings'>('generate');
  const [hasKey, setHasKey] = useState<boolean>(true); // Default to true, check on mount
  
  // Assistant Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatSessionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Advanced Options
  const [selectedStyle, setSelectedStyle] = useState('none');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState('1:1');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [suggestedPrompt, setSuggestedPrompt] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);

  // Reference Images (Visual LoRAs)
  const [referenceImages, setReferenceImages] = useState<{url: string, type: 'file' | 'url'}[]>([]);
  const [refUrl, setRefUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load state from local storage
  useEffect(() => {
    // Check if API key is selected (required for Nano Banana 2 Pro / Gemini 3.1 Flash Image)
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();

    const loadState = () => {
      try {
        const savedHistory = safeStorage.getItem('nb2_history');
        if (savedHistory) setHistory(JSON.parse(savedHistory));

        const savedTemplates = safeStorage.getItem('nb2_templates');
        if (savedTemplates) setTemplates(JSON.parse(savedTemplates));

        const savedCredits = safeStorage.getItem('nb2_credits');
        const savedRefresh = safeStorage.getItem('nb2_last_refresh');
        
        if (savedCredits && savedRefresh) {
          const lastRef = parseInt(savedRefresh);
          const now = Date.now();
          const oneDay = 24 * 60 * 60 * 1000;

          if (!isNaN(lastRef) && now - lastRef > oneDay) {
            setCredits(50);
            setLastRefresh(now);
            safeStorage.setItem('nb2_credits', '50');
            safeStorage.setItem('nb2_last_refresh', now.toString());
          } else if (!isNaN(lastRef)) {
            setCredits(parseInt(savedCredits) || 50);
            setLastRefresh(lastRef);
          }
        } else {
          safeStorage.setItem('nb2_credits', '50');
          safeStorage.setItem('nb2_last_refresh', Date.now().toString());
        }
      } catch (e) {
        console.error("Failed to load state from safeStorage:", e);
      }
    };
    loadState();
  }, []);

  // Save history to local storage
  useEffect(() => {
    safeStorage.setItem('nb2_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    safeStorage.setItem('nb2_templates', JSON.stringify(templates));
  }, [templates]);

  const parseImageData = (url: string) => {
    if (!url.startsWith('data:')) return null;
    try {
      const [header, data] = url.split(',');
      const mimeType = header.split(';')[0].split(':')[1];
      return { data, mimeType };
    } catch (e) {
      return null;
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (credits <= 0) {
      setError("You've run out of credits for today. They will refresh automatically tomorrow.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSuggestedPrompt(null);
    setIsBlurred(matureMode);

    try {
      const validReferences = referenceImages
        .map(img => parseImageData(img.url))
        .filter((img): img is { data: string, mimeType: string } => img !== null);

      const imageUrl = await generateImage(
        prompt, 
        matureMode, 
        selectedAspectRatio, 
        selectedStyle, 
        negativePrompt,
        validReferences,
        seed
      );
      
      const newImage: GeneratedImage = {
        id: Math.random().toString(36).substring(7),
        url: imageUrl,
        prompt: prompt,
        timestamp: Date.now(),
        isMature: matureMode,
        aspectRatio: selectedAspectRatio,
        style: selectedStyle,
        references: referenceImages.map(img => img.url),
        seed: seed
      };

      setCurrentImage(newImage);
      setHistory([newImage, ...history]);
      
      // Free img2img mode: only decrement if no references
      if (referenceImages.length === 0) {
        const newCredits = credits - 1;
        setCredits(newCredits);
        safeStorage.setItem('nb2_credits', newCredits.toString());
      }
      
      setPrompt('');
      setNegativePrompt('');
      setReferenceImages([]);
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      if (errorMsg.includes("permission") || errorMsg.includes("403") || errorMsg.includes("not found")) {
        setHasKey(false);
        setError("Your API key doesn't have permission for this model. Please select a paid Google Cloud project key.");
      } else {
        setError(errorMsg || "Something went wrong during generation.");
      }
      
      // If it's a safety block, try to get a refined suggestion
      if (errorMsg.includes("safety filters") || errorMsg.includes("SAFETY")) {
        setIsRefining(true);
        try {
          const suggestion = await suggestRefinedPrompt(prompt);
          setSuggestedPrompt(suggestion);
        } catch (refineErr) {
          console.error("Failed to get refined prompt suggestion:", refineErr);
        } finally {
          setIsRefining(false);
        }
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteFromHistory = (id: string) => {
    setHistory(history.filter(img => img.id !== id));
    if (currentImage?.id === id) setCurrentImage(null);
  };

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (referenceImages.length >= 3) {
      setError("Maximum 3 reference images allowed.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setReferenceImages([...referenceImages, { url: reader.result as string, type: 'file' }]);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addUrlReference = () => {
    if (!refUrl.trim()) return;
    if (referenceImages.length >= 3) {
      setError("Maximum 3 reference images allowed.");
      return;
    }
    setReferenceImages([...referenceImages, { url: refUrl, type: 'url' }]);
    setRefUrl('');
  };

  const removeReference = (index: number) => {
    setReferenceImages(referenceImages.filter((_, i) => i !== index));
  };

  const handleEnhancePrompt = async () => {
    if (!prompt.trim()) return;
    setIsEnhancing(true);
    try {
      const enhanced = await enhancePrompt(prompt);
      setPrompt(enhanced);
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      if (errorMsg.includes("permission") || errorMsg.includes("403") || errorMsg.includes("not found")) {
        setHasKey(false);
        setError("Your API key doesn't have permission for this model. Please select a paid Google Cloud project key.");
      } else {
        setError("Failed to enhance prompt.");
      }
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleUpscale = async (img: GeneratedImage) => {
    if (credits <= 0) {
      setError("Not enough credits to upscale.");
      return;
    }
    setIsUpscaling(true);
    try {
      const validReferences = (img.references || [])
        .map(url => parseImageData(url))
        .filter((ref): ref is { data: string, mimeType: string } => ref !== null);

      const upscaledUrl = await generateImage(
        img.prompt,
        img.isMature,
        img.aspectRatio,
        img.style,
        "", // Negative prompt not stored in history for now
        validReferences,
        img.seed,
        "4K"
      );
      
      const newImage: GeneratedImage = {
        ...img,
        id: Math.random().toString(36).substring(7),
        url: upscaledUrl,
        timestamp: Date.now(),
      };
      
      setHistory([newImage, ...history]);
      setCredits(prev => prev - 1);
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      if (errorMsg.includes("permission") || errorMsg.includes("403") || errorMsg.includes("not found")) {
        setHasKey(false);
        setError("Your API key doesn't have permission for this model. Please select a paid Google Cloud project key.");
      } else {
        setError("Failed to upscale image.");
      }
    } finally {
      setIsUpscaling(false);
    }
  };

  const saveAsTemplate = () => {
    if (!prompt.trim()) return;
    const newTemplate: Template = {
      id: Math.random().toString(36).substring(7),
      name: prompt.substring(0, 20) + "...",
      prompt,
      negativePrompt,
      style: selectedStyle,
      aspectRatio: selectedAspectRatio
    };
    setTemplates([newTemplate, ...templates]);
  };

  const applyTemplate = (t: Template) => {
    setPrompt(t.prompt);
    setNegativePrompt(t.negativePrompt || "");
    setSelectedStyle(t.style);
    setSelectedAspectRatio(t.aspectRatio);
    setActiveTab('generate');
  };

  const applySuggestedPrompt = () => {
    if (suggestedPrompt) {
      setPrompt(suggestedPrompt);
      setSuggestedPrompt(null);
      setError(null);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      text: chatInput,
      timestamp: Date.now()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      if (!chatSessionRef.current) {
        chatSessionRef.current = startChat();
      }

      const result = await chatSessionRef.current.sendMessage({ message: chatInput });
      
      let modelText = result.text;
      
      if (!modelText && result.candidates?.[0]?.finishReason === 'SAFETY') {
        modelText = "I'm sorry, but your message was flagged by the safety filters. I'm here to help you rewrite prompts to be safe and artistic. Please try rephrasing your request without using explicit or restricted terms.";
      } else if (!modelText) {
        modelText = "I'm sorry, I couldn't process that. Please try again or rephrase your request.";
      }

      const modelMessage: ChatMessage = {
        role: 'model',
        text: modelText,
        timestamp: Date.now()
      };
      setChatMessages(prev => [...prev, modelMessage]);
    } catch (err: any) {
      console.error("Chat error:", err);
      const errorMessage: ChatMessage = {
        role: 'model',
        text: "I encountered an error. This might be due to safety filters or a connection issue. Try rephrasing your request.",
        timestamp: Date.now()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const extractPromptFromChat = (text: string) => {
    const match = text.match(/\[PROMPT\]([\s\S]*?)\[\/PROMPT\]/);
    return match ? match[1].trim() : null;
  };

  const applyPromptFromChat = (text: string) => {
    const extracted = extractPromptFromChat(text);
    if (extracted) {
      setPrompt(extracted);
      setActiveTab('generate');
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasKey(true); // Assume success per guidelines
    }
  };

  if (!hasKey) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] text-white flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(249,115,22,0.4)]">
          <ShieldAlert className="w-8 h-8 text-black" />
        </div>
        <h1 className="text-2xl font-bold mb-4">API Key Required</h1>
        <div className="space-y-4 mb-8 max-w-xs">
          <p className="text-sm text-white/60 leading-relaxed">
            NB2 Pro uses advanced <span className="text-orange-400 font-bold">Gemini 3.1</span> models (Nano Banana 2) which require a paid Google Cloud project.
          </p>
          <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-left">
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500 mb-2">Important Note</p>
            <p className="text-[11px] text-white/40 leading-relaxed">
              You won't see a project named "Nano Banana 2". Instead, <span className="text-white/80">select any of your existing projects</span> (like "My First Project" or "Zapz") that has billing enabled.
            </p>
          </div>
        </div>
        <button 
          onClick={handleSelectKey}
          className="w-full max-w-xs py-4 bg-orange-500 text-black rounded-full font-bold text-sm shadow-lg active:scale-95 transition-all"
        >
          Select API Key
        </button>
        <div className="mt-8 flex flex-col gap-4">
          <a 
            href="https://console.cloud.google.com/billing" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[10px] text-white/40 hover:text-white transition-colors flex items-center justify-center gap-2"
          >
            <Info className="w-3 h-3" />
            Check Billing Status
          </a>
          <a 
            href="https://ai.google.dev/gemini-api/docs/billing" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[10px] text-white/20 uppercase tracking-widest hover:text-white/40 transition-colors"
          >
            Learn about billing & keys
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white font-sans selection:bg-orange-500/30">
      <div className="h-8 bg-[#0F0F0F]" />

      <header className="px-6 py-4 flex items-center justify-between border-b border-white/5 sticky top-0 bg-[#0F0F0F]/80 backdrop-blur-xl z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">NB2 Pro</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-white/5 rounded-full flex items-center gap-2 border border-white/10">
            <Sparkles className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-xs font-medium">{credits} Credits</span>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-6 pb-32 pt-6">
        <AnimatePresence mode="wait">
          {activeTab === 'generate' && (
            <motion.div 
              key="generate"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Image Preview Area */}
              <div className="aspect-square w-full bg-white/5 rounded-3xl overflow-hidden border border-white/10 relative group shadow-2xl">
                {isGenerating ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/40 backdrop-blur-sm">
                    <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
                    <p className="text-sm text-white/60 animate-pulse">Generating your vision...</p>
                  </div>
                ) : currentImage ? (
                  <div className="relative w-full h-full">
                    <img 
                      src={currentImage.url} 
                      alt={currentImage.prompt}
                      className={`w-full h-full object-cover transition-all duration-500 ${isBlurred ? 'blur-3xl scale-110' : 'blur-0 scale-100'}`}
                    />
                    
                    {isBlurred && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/20 backdrop-blur-sm">
                        <ShieldAlert className="w-12 h-12 text-orange-500" />
                        <button 
                          onClick={() => setIsBlurred(false)}
                          className="px-6 py-2 bg-white text-black rounded-full text-sm font-bold shadow-lg active:scale-95 transition-transform"
                        >
                          Reveal Image
                        </button>
                        <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Mature Content Hidden</p>
                      </div>
                    )}

                    {!isBlurred && (
                      <div className="absolute bottom-4 right-4 flex gap-2">
                        <button 
                          onClick={() => setIsBlurred(true)}
                          className="p-2 bg-black/50 backdrop-blur-md rounded-full border border-white/10 hover:bg-black/70 transition-colors"
                        >
                          <EyeOff className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => downloadImage(currentImage.url, `nb2-${currentImage.id}.png`)}
                          className="p-2 bg-black/50 backdrop-blur-md rounded-full border border-white/10 hover:bg-black/70 transition-colors"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/20">
                    <ImageIcon className="w-16 h-16" />
                    <p className="text-sm font-medium">Ready to create</p>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex flex-col gap-3"
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-200">{error}</p>
                  </div>
                  
                  {isRefining && (
                    <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-widest font-bold ml-8">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Finding a safe alternative...
                    </div>
                  )}

                  {suggestedPrompt && (
                    <div className="ml-8 p-3 bg-white/5 rounded-xl border border-white/10 space-y-2">
                      <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">Suggested Safe Alternative</p>
                      <p className="text-xs text-white/60 italic leading-relaxed">"{suggestedPrompt}"</p>
                      <button 
                        onClick={applySuggestedPrompt}
                        className="w-full py-2 bg-orange-500 text-black rounded-lg text-[10px] font-bold uppercase hover:bg-orange-400 transition-colors"
                      >
                        Apply Suggestion
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Prompt Input Area */}
              <div className="space-y-4">
                {/* Style Selector */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 ml-2">Choose Style</p>
                  <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {STYLES.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setSelectedStyle(style.id)}
                        className={`flex-shrink-0 px-4 py-2 rounded-2xl border text-xs font-medium transition-all flex items-center gap-2 ${
                          selectedStyle === style.id 
                            ? 'bg-orange-500 border-orange-500 text-black' 
                            : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20'
                        }`}
                      >
                        <span>{style.icon}</span>
                        {style.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe what you want to see..."
                    className="w-full bg-white/5 border border-white/10 rounded-3xl p-5 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all resize-none placeholder:text-white/20 pr-12"
                  />
                  <button 
                    onClick={handleEnhancePrompt}
                    disabled={isEnhancing || !prompt.trim()}
                    className="absolute right-4 top-4 p-2 bg-orange-500 rounded-xl text-black hover:bg-orange-400 transition-colors disabled:opacity-50"
                    title="Enhance Prompt"
                  >
                    {isEnhancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={saveAsTemplate}
                    disabled={!prompt.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase hover:bg-white/10 disabled:opacity-30"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Template
                  </button>
                </div>

                {/* Reference Images (Visual LoRAs) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Visual References (LoRAs)</p>
                      {referenceImages.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[8px] font-bold rounded border border-green-500/30">FREE MODE</span>
                      )}
                    </div>
                    <span className="text-[10px] text-white/20">{referenceImages.length}/3</span>
                  </div>
                  
                  <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                    {referenceImages.map((img, idx) => (
                      <div key={idx} className="relative shrink-0 w-20 h-20 rounded-2xl overflow-hidden border border-white/10 bg-white/5">
                        <img src={img.url} className="w-full h-full object-cover" alt="Reference" />
                        <button 
                          onClick={() => removeReference(idx)}
                          className="absolute top-1 right-1 p-1 bg-black/60 rounded-full hover:bg-red-500 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    
                    {referenceImages.length < 3 && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="w-20 h-20 rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-1 text-white/20 hover:border-orange-500/50 hover:text-orange-500/50 transition-all"
                        >
                          <Plus className="w-6 h-6" />
                          <span className="text-[8px] font-bold uppercase">Upload</span>
                        </button>
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleFileChange} 
                          accept="image/*" 
                          className="hidden" 
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input 
                        type="text"
                        value={refUrl}
                        onChange={(e) => setRefUrl(e.target.value)}
                        placeholder="Paste image URL..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                      />
                      <LinkIcon className="absolute right-3 top-2.5 w-3.5 h-3.5 text-white/20" />
                    </div>
                    <button 
                      onClick={addUrlReference}
                      disabled={!refUrl.trim() || referenceImages.length >= 3}
                      className="px-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-bold uppercase hover:bg-white/10 disabled:opacity-30"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Advanced Options Toggle */}
                <button 
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-white/5 rounded-2xl border border-white/10 text-xs font-bold text-white/40 hover:text-white/60 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Settings className="w-3.5 h-3.5" />
                    Advanced Options
                  </div>
                  {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                <AnimatePresence>
                  {showAdvanced && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-4"
                    >
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Aspect Ratio</p>
                          <div className="flex gap-2">
                            {ASPECT_RATIOS.map((ratio) => (
                              <button
                                key={ratio.id}
                                onClick={() => setSelectedAspectRatio(ratio.id)}
                                className={`flex-1 py-2 rounded-xl border text-[10px] font-bold transition-all ${
                                  selectedAspectRatio === ratio.id 
                                    ? 'bg-white text-black border-white' 
                                    : 'bg-white/5 border-white/10 text-white/40'
                                }`}
                              >
                                {ratio.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Negative Prompt (Avoid)</p>
                          <input 
                            type="text"
                            value={negativePrompt}
                            onChange={(e) => setNegativePrompt(e.target.value)}
                            placeholder="e.g. blurry, low quality, distorted"
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                          />
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Seed (Optional)</p>
                          <input 
                            type="number"
                            value={seed || ""}
                            onChange={(e) => setSeed(e.target.value ? parseInt(e.target.value) : undefined)}
                            placeholder="Random seed"
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setMatureMode(!matureMode)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
                        matureMode 
                          ? 'bg-orange-500/10 border-orange-500/50 text-orange-400' 
                          : 'bg-white/5 border-white/10 text-white/40'
                      }`}
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span className="text-xs font-bold uppercase tracking-wider">18+ Mode</span>
                    </button>
                  </div>
                  
                  <button 
                    disabled={isGenerating || !prompt.trim()}
                    onClick={handleGenerate}
                    className="px-8 py-4 bg-orange-500 text-black rounded-full font-bold text-sm shadow-[0_0_20px_rgba(249,115,22,0.3)] active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all flex items-center gap-2"
                  >
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Generate
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'assistant' && (
            <motion.div 
              key="assistant"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col h-[calc(100vh-180px)]"
            >
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 no-scrollbar pb-4">
                {chatMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-40">
                    <div className="p-4 bg-white/5 rounded-full">
                      <MessageSquare className="w-12 h-12" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-bold uppercase tracking-widest">Prompt Assistant</p>
                      <p className="text-xs max-w-[200px]">Ask me to help you refine your ideas or rewrite blocked prompts safely.</p>
                    </div>
                  </div>
                )}
                
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-4 rounded-2xl space-y-3 ${
                      msg.role === 'user' 
                        ? 'bg-orange-500 text-black rounded-tr-none' 
                        : 'bg-white/5 border border-white/10 text-white/80 rounded-tl-none'
                    }`}>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                      
                      {msg.role === 'model' && extractPromptFromChat(msg.text) && (
                        <button 
                          onClick={() => applyPromptFromChat(msg.text)}
                          className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center gap-2 text-[10px] font-bold uppercase transition-colors"
                        >
                          <ArrowUpCircle className="w-4 h-4" />
                          Apply to Generator
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl rounded-tl-none">
                      <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="mt-4 relative">
                <input 
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ask for prompt help..."
                  className="w-full bg-white/5 border border-white/10 rounded-full py-4 pl-6 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all"
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={!chatInput.trim() || isChatLoading}
                  className="absolute right-2 top-2 p-2 bg-orange-500 rounded-full text-black hover:bg-orange-400 transition-colors disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'gallery' && (
            <motion.div 
              key="gallery"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* Templates Section */}
              {templates.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold">Templates</h2>
                    <button 
                      onClick={() => setTemplates([])}
                      className="text-[10px] font-bold text-white/20 hover:text-red-400"
                    >
                      CLEAR ALL
                    </button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                    {templates.map(t => (
                      <button 
                        key={t.id}
                        onClick={() => applyTemplate(t)}
                        className="shrink-0 w-32 p-3 bg-white/5 border border-white/10 rounded-2xl text-left space-y-2 hover:bg-white/10 transition-colors"
                      >
                        <p className="text-[10px] font-bold truncate">{t.name}</p>
                        <p className="text-[8px] text-white/40 line-clamp-2">{t.prompt}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold">Gallery</h2>
                  <button 
                    onClick={() => {
                      setHistory([]);
                      setCurrentImage(null);
                    }}
                    className="p-2 text-white/40 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                {history.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-white/10 gap-4">
                    <ImageIcon className="w-16 h-16" />
                    <p className="text-sm font-medium">No images yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {history.map((img) => (
                      <div 
                        key={img.id} 
                        className="aspect-square rounded-2xl overflow-hidden border border-white/10 relative group bg-white/5"
                      >
                        <img 
                          src={img.url} 
                          alt={img.prompt}
                          className={`w-full h-full object-cover ${img.isMature ? 'blur-lg' : ''}`}
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                          <p className="text-[10px] text-center line-clamp-2 text-white/80 mb-1">{img.prompt}</p>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                setCurrentImage(img);
                                setActiveTab('generate');
                                setIsBlurred(img.isMature);
                              }}
                              className="p-1.5 bg-white/20 rounded-lg hover:bg-white/40"
                              title="View"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(img.prompt);
                              }}
                              className="p-1.5 bg-white/20 rounded-lg hover:bg-white/40"
                              title="Copy Prompt"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleUpscale(img)}
                              disabled={isUpscaling}
                              className="p-1.5 bg-orange-500/20 rounded-lg hover:bg-orange-500/40 disabled:opacity-50"
                              title="Upscale to 4K"
                            >
                              {isUpscaling ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpCircle className="w-4 h-4 text-orange-400" />}
                            </button>
                            <button 
                              onClick={() => deleteFromHistory(img.id)}
                              className="p-1.5 bg-red-500/20 rounded-lg hover:bg-red-500/40"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <h2 className="text-xl font-bold">App Settings</h2>
              
              <div className="space-y-4">
                <div className="p-5 bg-white/5 rounded-3xl border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold">Mature Mode (18+)</p>
                      <p className="text-xs text-white/40">Disable extra prompt filtering</p>
                    </div>
                    <button 
                      onClick={() => setMatureMode(!matureMode)}
                      className={`w-12 h-6 rounded-full relative transition-colors ${matureMode ? 'bg-orange-500' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${matureMode ? 'left-7' : 'left-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-orange-500/10 rounded-2xl border border-orange-500/20">
                    <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0" />
                    <p className="text-[10px] text-orange-200/80 leading-relaxed">
                      Mature mode removes developer-added safety layers. The model's native filters still apply. Images will be auto-blurred for your privacy.
                    </p>
                  </div>
                </div>

                <div className="p-5 bg-white/5 rounded-3xl border border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-bold">Daily Quota</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-orange-400 font-mono">{credits}/50</span>
                      <button 
                        onClick={() => {
                          setCredits(50);
                          safeStorage.setItem('nb2_credits', '50');
                        }}
                        className="p-1 bg-white/5 rounded-lg hover:bg-white/10 text-[10px] font-bold text-white/40"
                      >
                        REFRESH
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-orange-500 transition-all duration-1000" 
                      style={{ width: `${(credits / 50) * 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-white/20 mt-3 text-center">
                    Refreshes automatically every 24 hours
                  </p>
                </div>

                <div className="p-5 bg-white/5 rounded-3xl border border-white/10 space-y-2">
                  <p className="text-sm font-bold">API Configuration</p>
                  <button 
                    onClick={handleSelectKey}
                    className="w-full py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold hover:bg-white/10 transition-colors"
                  >
                    Change API Key
                  </button>
                </div>

                <div className="p-5 bg-white/5 rounded-3xl border border-white/10 space-y-2">
                  <p className="text-sm font-bold">About NB2 Pro</p>
                  <p className="text-xs text-white/40 leading-relaxed">
                    Powered by Gemini 3.1 Flash Image Preview (Nano Banana 2). 
                    Direct API integration for maximum throughput and zero middleman filtering.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#0F0F0F]/80 backdrop-blur-2xl border-t border-white/5 px-8 py-4 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button 
            onClick={() => setActiveTab('generate')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'generate' ? 'text-orange-500' : 'text-white/20'}`}
          >
            <Sparkles className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Create</span>
          </button>
          <button 
            onClick={() => setActiveTab('assistant')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'assistant' ? 'text-orange-500' : 'text-white/20'}`}
          >
            <MessageSquare className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Assistant</span>
          </button>
          <button 
            onClick={() => setActiveTab('gallery')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'gallery' ? 'text-orange-500' : 'text-white/20'}`}
          >
            <ImageIcon className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Gallery</span>
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'settings' ? 'text-orange-500' : 'text-white/20'}`}
          >
            <Settings className="w-6 h-6" />
            <span className="text-[10px] font-bold uppercase tracking-tighter">Setup</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
